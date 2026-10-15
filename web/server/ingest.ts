import { createHash, randomUUID } from "node:crypto";
import { access, constants, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "./config.js";
import { ingestSkillDir } from "./config.js";
import { QueryError } from "./wiki.js";
import { rawPathForUpload, type IngestInput } from "./ingest-upload.js";
import {
  createStaging,
  cleanupStaging,
  digestTree,
  scanSources,
  collectChanges,
  applyChanges,
  verifyStaging,
  runEvidenceLint,
  type FileChange,
} from "./ingest-staging.js";
import {
  loadIngestSkill,
  buildTaskPrompt,
  classifyIngestError,
  claudeAgentQuery,
  ingestEndpoint,
  type IngestAgentQuery,
} from "./ingest-sdk.js";
export type IngestStatus =
  | "running"
  | "preview"
  | "applied"
  | "discarded"
  | "cancelled"
  | "error";
export type IngestJob = {
  id: string;
  kind: "url" | "file";
  source: string;
  status: IngestStatus;
  createdAt: number;
  lastUsed: number;
  notices: string[];
  controller?: AbortController;
  staging?: string;
  baseline?: Map<string, string>;
  changes?: FileChange[];
  deleted?: string[];
  warnings?: string[];
  lintReport?: string | null;
  summary?: string;
  error?: { code: string; message: string };
};
type Listener = (event: string, data: unknown) => void;
const MAX_JOBS = 20;
const BUFFER_CAP = 500;
const PREVIEW_IDLE_MS = 30 * 60_000;
const FINISHED_KEEP_MS = 60 * 60_000;
const sha256 = (data: string) =>
  createHash("sha256").update(data).digest("hex");
export class IngestStore {
  private jobs = new Map<string, IngestJob>();
  private buffers = new Map<string, { event: string; data: unknown }[]>();
  private listeners = new Map<string, Set<Listener>>();
  private lintScript = path.resolve(
    ingestSkillDir,
    "../wiki-lint/scripts/check_evidence.py",
  );
  constructor(
    private c: Config,
    private agent: IngestAgentQuery = claudeAgentQuery,
  ) {}
  async start(input: IngestInput): Promise<IngestJob> {
    if (!this.c.ingestAvailable)
      throw new QueryError(
        "ingest_disabled",
        "摄入不可用（未启用或当前模型协议不支持）",
        503,
      );
    // Reserve the slot synchronously so concurrent starts cannot both slip
    // past the single-flight check while the pre-check awaits I/O.
    for (const job of this.jobs.values())
      if (job.status === "running")
        throw new QueryError("busy", "已有摄入任务进行中，请等待完成", 409);
    this.sweep(Date.now());
    if (this.jobs.size >= MAX_JOBS)
      throw new QueryError("capacity", "摄入任务记录达到上限，请稍后再试", 429);
    const job: IngestJob = {
      id: randomUUID(),
      kind: input.kind,
      source: input.kind === "url" ? input.url : input.filename,
      status: "running",
      createdAt: Date.now(),
      lastUsed: Date.now(),
      notices: [],
    };
    this.jobs.set(job.id, job);
    try {
      // Deterministic pre-checks the model is never trusted with: identical
      // content is rejected, a same-URL re-ingestion becomes a visible notice.
      const sources = await scanSources(this.c.root);
      let priorRaw: { rawPath: string; collected: string } | undefined;
      if (input.kind === "file") {
        const existing = sources.byBodySha.get(sha256(input.text));
        if (existing) {
          this.jobs.delete(job.id);
          this.buffers.delete(job.id);
          throw new QueryError(
            "duplicate",
            `内容与已有 raw 完全一致（${existing}），无需重复摄入`,
            409,
          );
        }
      } else {
        priorRaw = sources.byUrl.get(input.url);
        if (priorRaw)
          job.notices.push(
            `该 URL 已于 ${priorRaw.collected || "早前"} 摄入（${priorRaw.rawPath}），本次将作为新版本并存`,
          );
      }
      this.emit(job, "status", {
        status: "running",
        kind: job.kind,
        source: job.source,
        notices: job.notices,
      });
      void this.run(job, input, priorRaw).catch((error) =>
        this.fail(job, error),
      );
    } catch (error) {
      if (this.jobs.get(job.id) === job) {
        this.jobs.delete(job.id);
        this.buffers.delete(job.id);
      }
      throw error;
    }
    return job;
  }
  get(id: string): IngestJob | undefined {
    return this.jobs.get(id);
  }
  previewData(job: IngestJob) {
    return {
      id: job.id,
      status: job.status,
      kind: job.kind,
      source: job.source,
      notices: job.notices,
      summary: job.summary,
      changes: job.changes,
      deleted: job.deleted,
      warnings: job.warnings,
      lintReport: job.lintReport ?? undefined,
    };
  }
  subscribe(id: string, fn: Listener): () => void {
    for (const { event, data } of this.buffers.get(id) ?? []) fn(event, data);
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(id);
    };
  }
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === "running") {
      job.controller?.abort(new QueryError("cancelled", "摄入已取消"));
      return true;
    }
    if (job.status === "preview") {
      this.finish(job, "discarded");
      return true;
    }
    return false;
  }
  async apply(id: string): Promise<string[]> {
    const job = this.jobs.get(id);
    if (!job) throw new QueryError("missing", "摄入任务不存在", 404);
    if (job.status !== "preview")
      throw new QueryError("state", "任务不在预览状态，无法应用", 409);
    const applied = await applyChanges(
      this.c.root,
      job.staging!,
      job.changes!,
      job.baseline!,
    );
    this.finish(job, "applied");
    return applied;
  }
  sweep(now = Date.now()) {
    for (const [id, job] of this.jobs) {
      if (job.status === "preview" && now - job.lastUsed > PREVIEW_IDLE_MS)
        this.finish(job, "discarded");
      if (
        ["applied", "discarded", "cancelled", "error"].includes(job.status) &&
        now - job.lastUsed > FINISHED_KEEP_MS
      ) {
        this.jobs.delete(id);
        this.buffers.delete(id);
        this.listeners.delete(id);
      }
    }
  }
  close() {
    for (const job of this.jobs.values())
      if (job.status === "running")
        job.controller?.abort(new QueryError("cancelled", "服务停止"));
    for (const job of this.jobs.values())
      if (job.staging) void cleanupStaging(job.staging);
    this.jobs.clear();
    this.buffers.clear();
    this.listeners.clear();
  }
  private emit(job: IngestJob, event: string, data: unknown) {
    const buffer = this.buffers.get(job.id) ?? [];
    buffer.push({ event, data });
    // Keep the opening status event (it carries the notices) when trimming.
    while (buffer.length > BUFFER_CAP) buffer.splice(1, 1);
    this.buffers.set(job.id, buffer);
    for (const fn of this.listeners.get(job.id) ?? []) fn(event, data);
  }
  private finish(job: IngestJob, status: "applied" | "discarded") {
    job.status = status;
    job.lastUsed = Date.now();
    if (job.staging) void cleanupStaging(job.staging);
    job.staging = undefined;
    this.emit(job, "status", { status });
  }
  private fail(job: IngestJob, error: unknown) {
    const reason = job.controller?.signal.reason;
    const e =
      error instanceof QueryError
        ? error
        : reason instanceof QueryError
          ? reason
          : classifyIngestError(error);
    job.status = e.code === "cancelled" ? "cancelled" : "error";
    job.error = { code: e.code, message: e.message };
    job.lastUsed = Date.now();
    if (job.staging) void cleanupStaging(job.staging);
    job.staging = undefined;
    this.emit(job, "error", { code: e.code, message: e.message });
  }
  private async run(
    job: IngestJob,
    input: IngestInput,
    priorRaw?: { rawPath: string; collected: string },
  ) {
    const controller = new AbortController();
    job.controller = controller;
    const timer = setTimeout(
      () =>
        controller.abort(
          new QueryError("timeout", "摄入超时，请重试或调整超时配置"),
        ),
      this.c.ingestTimeoutMs,
    );
    try {
      job.staging = await createStaging(this.c.root);
      job.baseline = await digestTree(this.c.root);
      const today = new Date().toISOString().slice(0, 10);
      let fetchHost: string | undefined;
      let task: Parameters<typeof buildTaskPrompt>[0];
      if (input.kind === "file") {
        const rawPath = await rawPathForUpload(
          input.filename,
          today,
          async (candidate) => {
            try {
              await access(path.join(job.staging!, candidate), constants.F_OK);
              return true;
            } catch {
              return false;
            }
          },
        );
        const title = input.filename.replace(/\.(md|txt)$/i, "");
        const content = `# ${title}\n\n> Source: uploaded file "${input.filename}"\n> Collected: ${today}\n> Published: Unknown\n\n${input.text}\n`;
        await mkdir(path.dirname(path.join(job.staging, rawPath)), {
          recursive: true,
        });
        await writeFile(path.join(job.staging, rawPath), content);
        task = {
          kind: "file",
          source: input.filename,
          today,
          rawPath,
          sha256: sha256(content),
        };
      } else {
        fetchHost = new URL(input.url).hostname;
        task = { kind: "url", source: input.url, today, priorRaw };
      }
      const { skill, templates } = await loadIngestSkill();
      const summary = await this.drive(job, {
        taskPrompt: buildTaskPrompt(task),
        systemAppend: `${skill}\n\n# File templates\n${templates}`,
        fetchHost,
        controller,
      });
      controller.signal.throwIfAborted();
      const verify = await verifyStaging(
        job.staging,
        this.c.root,
        job.baseline,
      );
      if (verify.problems.length)
        throw new QueryError(
          "ingest",
          `摄入产物校验失败：${verify.problems.join("；")}`,
          500,
        );
      const warnings = verify.fixed.map(
        (f) => `已修正 log 条目中的 SHA-256：${f}`,
      );
      const lint = await runEvidenceLint(
        job.staging,
        this.lintScript,
        this.c.ingestValidate,
      );
      const { changes, deleted, outside, drifted } = await collectChanges(
        this.c.root,
        job.staging,
        job.baseline,
      );
      if (deleted.length)
        warnings.push(`Agent 删除了文件（不会应用）：${deleted.join("、")}`);
      if (outside.length)
        warnings.push(
          `Agent 在工作区外写入了文件（不会应用）：${outside.join("、")}`,
        );
      if (drifted.length)
        warnings.push(
          `以下文件在摄入运行期间被外部修改，未纳入本次变更，请重新摄入：${drifted.join("、")}`,
        );
      job.changes = changes;
      job.deleted = deleted;
      job.warnings = warnings;
      job.lintReport = lint;
      job.summary = summary;
      // Re-check the abort right before committing to preview: verification
      // and linting take a moment, and a cancel that already answered 204
      // must not surface a preview afterwards.
      controller.signal.throwIfAborted();
      job.status = "preview";
      job.lastUsed = Date.now();
      this.emit(job, "done", this.previewData(job));
    } finally {
      clearTimeout(timer);
    }
  }
  private async drive(
    job: IngestJob,
    i: {
      taskPrompt: string;
      systemAppend: string;
      fetchHost?: string;
      controller: AbortController;
    },
  ): Promise<string> {
    const endpoint = ingestEndpoint(this.c);
    let summary = "";
    for await (const message of this.agent({
      taskPrompt: i.taskPrompt,
      systemAppend: i.systemAppend,
      cwd: job.staging!,
      ...endpoint,
      maxTurns: this.c.ingestMaxTurns,
      abortController: i.controller,
      fetchHost: i.fetchHost,
    })) {
      job.lastUsed = Date.now();
      if (message.type === "tool_use") {
        const input = message.input as Record<string, unknown | undefined>;
        this.emit(job, "progress", {
          tool: message.name,
          path:
            typeof input.file_path === "string"
              ? input.file_path
              : typeof input.pattern === "string"
                ? input.pattern
                : undefined,
          url: typeof input.url === "string" ? input.url : undefined,
        });
      } else if (message.type === "text") {
        summary += `${message.text}\n`;
        this.emit(job, "delta", { text: message.text });
      } else if (message.subtype !== "success") {
        if (message.subtype === "max_turns")
          throw new QueryError("turns", "摄入步骤数达到上限，请重试或拆分来源");
        throw new QueryError(
          "ingest",
          `模型执行出错：${message.errors?.join("；") || "未知错误"}`,
          502,
        );
      } else if (message.text) summary = message.text;
    }
    return summary.trim();
  }
}

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  rm,
  readdir,
  readFile,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { QueryError } from "./wiki.js";
import { diffLines, formatDiff } from "./ingest-diff.js";
const execFileAsync = promisify(execFile);
export type FileChange = {
  path: string;
  change: "added" | "modified";
  additions: number;
  deletions: number;
  diff: string;
};
const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export async function createStaging(root: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "wiki-ingest-"));
  try {
    // dereference so the agent only ever sees plain files inside staging.
    await cp(path.join(root, "wiki"), path.join(dir, "wiki"), {
      recursive: true,
      dereference: true,
    });
    await cp(path.join(root, "raw"), path.join(dir, "raw"), {
      recursive: true,
      dereference: true,
    });
  } catch (error) {
    await cleanupStaging(dir);
    throw error;
  }
  return dir;
}
export async function cleanupStaging(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
// path → sha256 for every .md/.txt file under wiki/ and raw/ — the same
// whitelist documentPath enforces; missing trees are skipped so the helper
// works for both the real root and a staging copy. Other file types the agent
// drops in are reported via collectChanges' outside/deleted notes instead.
export async function digestTree(root: string): Promise<Map<string, string>> {
  const digest = new Map<string, string>();
  const walk = async (relative: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(path.join(root, relative), {
        withFileTypes: true,
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = relative + "/" + entry.name;
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile() && /\.(md|txt)$/i.test(p))
        digest.set(p, sha256(await readFile(path.join(root, p))));
    }
  };
  await walk("wiki");
  await walk("raw");
  return digest;
}
export type ExistingSources = {
  byUrl: Map<string, { rawPath: string; collected: string }>;
  byBodySha: Map<string, string>;
};
// Strip the raw template header (`# Title` + `> Source/Collected/Published`)
// so re-uploading identical content is detected by body alone; files without
// a matching header are compared as-is.
function rawBody(text: string): string {
  return text.match(/^#[^\n]*\n+((?:>[^\n]*\n)+)\n([\s\S]*)$/)?.[2] ?? text;
}
// Parse `> Source:` / `> Collected:` headers of every raw document so intake
// can detect identical content (SHA) and same-URL re-ingestion deterministically.
export async function scanSources(root: string): Promise<ExistingSources> {
  const byUrl = new Map<string, { rawPath: string; collected: string }>();
  const byBodySha = new Map<string, string>();
  const walk = async (relative: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(path.join(root, relative), {
        withFileTypes: true,
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = relative + "/" + entry.name;
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile() && /\.md$/i.test(p)) {
        const text = await readFile(path.join(root, p), "utf8");
        byBodySha.set(sha256(rawBody(text)), p);
        const source = text.match(/^>\s*Source:\s*(.+)$/m)?.[1]?.trim();
        if (source && /^https?:\/\//i.test(source))
          byUrl.set(source, {
            rawPath: p,
            collected:
              text.match(/^>\s*Collected:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || "",
          });
      }
    }
  };
  await walk("raw");
  return { byUrl, byBodySha };
}
export async function collectChanges(
  root: string,
  staging: string,
  baseline?: Map<string, string>,
): Promise<{
  changes: FileChange[];
  deleted: string[];
  outside: string[];
  drifted: string[];
}> {
  // Diff against the baseline captured when the job started: re-reading the
  // real root here would fold external edits made while the agent ran into
  // the preview as reversing diffs, and applying them would undo those edits.
  const before = baseline ?? (await digestTree(root));
  const after = await digestTree(staging);
  const rootNow = baseline ? await digestTree(root) : before;
  const changes: FileChange[] = [];
  const drifted: string[] = [];
  for (const [p, sha] of after)
    if (before.get(p) !== sha) {
      // The real library moved under us mid-run: a diff built against the
      // current root file would mix the external edit in as reversing lines.
      if (baseline && rootNow.get(p) !== before.get(p)) {
        drifted.push(p);
        continue;
      }
      const newText = await readFile(path.join(staging, p), "utf8");
      const oldText = before.has(p)
        ? await readFile(path.join(root, p), "utf8")
        : "";
      const { hunks, additions, deletions } = diffLines(oldText, newText);
      changes.push({
        path: p,
        change: before.has(p) ? "modified" : "added",
        additions,
        deletions,
        diff: formatDiff(p, hunks),
      });
    }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  const deleted = [...before.keys()].filter((p) => !after.has(p)).sort();
  // Everything the digest whitelist skips is surfaced as "outside" so the
  // preview shows it will not be applied — including non-.md/.txt files the
  // agent dropped inside wiki/ or raw/. Files the real library already ships
  // (e.g. image attachments) are skipped.
  const outside: string[] = [];
  const walkOutside = async (relative: string) => {
    for (const entry of await readdir(path.join(staging, relative), {
      withFileTypes: true,
    })) {
      const p = relative + "/" + entry.name;
      if (entry.isDirectory()) await walkOutside(p);
      else if (
        entry.isFile() &&
        !after.has(p) &&
        !existsSync(path.join(root, p))
      )
        outside.push(p);
    }
  };
  await walkOutside("wiki");
  await walkOutside("raw");
  for (const entry of await readdir(staging, { withFileTypes: true }))
    if (entry.isDirectory() && entry.name !== "wiki" && entry.name !== "raw")
      await walkOutside(entry.name);
    else if (entry.isFile()) outside.push(entry.name);
  return { changes, deleted, outside, drifted: drifted.sort() };
}
export async function applyChanges(
  root: string,
  staging: string,
  changes: FileChange[],
  baseline: Map<string, string>,
): Promise<string[]> {
  const applied: string[] = [];
  const current = await digestTree(root);
  // Validate every change first so a conflict aborts before anything is
  // written — a half-applied batch would break the preview promise.
  for (const change of changes) {
    if (!/^(wiki|raw)\/[^/].*\.(md|txt)$/i.test(change.path))
      throw new QueryError("path", `变更路径越界：${change.path}`);
    const existing = current.get(change.path);
    // Guard against edits made to the real library between preview and apply.
    if (change.change === "modified" && existing !== baseline.get(change.path))
      throw new QueryError(
        "conflict",
        `预览后知识库被外部修改：${change.path}，请重新摄入`,
        409,
      );
    if (change.change === "added" && existing !== undefined)
      throw new QueryError(
        "conflict",
        `预览后知识库出现同名文件：${change.path}，请重新摄入`,
        409,
      );
    const target = path.join(root, change.path);
    if (path.resolve(target) !== target)
      throw new QueryError("path", "变更路径越界");
  }
  for (const change of changes) {
    const target = path.join(root, change.path);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(staging, change.path), target);
    applied.push(change.path);
  }
  return applied;
}
// Post-agent check on the staging copy: every new raw document must be
// referenced by wiki/log.md (ingest or no-material entry), and the SHA-256
// recorded there must match the file we actually have — model-computed hashes
// are corrected instead of trusted. Existing raw files must never change.
export async function verifyStaging(
  staging: string,
  root: string,
  baseline?: Map<string, string>,
): Promise<{ fixed: string[]; problems: string[] }> {
  // Baseline keeps external edits made while the agent ran from being
  // misreported as the agent tampering with immutable raw files.
  const before = baseline ?? (await digestTree(root));
  const after = await digestTree(staging);
  const newRaws = [...after.keys()]
    .filter((p) => /^raw\/.*\.md$/i.test(p) && !before.has(p))
    .sort();
  const fixed: string[] = [];
  const problems: string[] = [];
  for (const [p, sha] of after)
    if (
      /^raw\//i.test(p) &&
      before.has(p) &&
      before.get(p) !== sha &&
      !problems.some((problem) => problem.includes(p))
    )
      problems.push(`Agent 修改了既有 raw（raw 层不可变）：${p}`);
  if (!newRaws.length) return { fixed, problems };
  const logFile = path.join(staging, "wiki/log.md");
  const lines = (await readFile(logFile, "utf8").catch(() => "")).split("\n");
  const starts = lines
    .map((line, i) => (/^## \[/.test(line) ? i : -1))
    .filter((i) => i >= 0);
  for (const raw of newRaws) {
    const hash = sha256(await readFile(path.join(staging, raw)));
    let references = false;
    for (let e = 0; e < starts.length; e++) {
      const from = starts[e];
      const to = e + 1 < starts.length ? starts[e + 1] : lines.length;
      const entry = lines.slice(from, to);
      if (entry.some((l) => l.includes(`no material: ${raw}`))) {
        references = true;
        continue;
      }
      const rawLine = entry.findIndex((l) => l.includes(`- Raw: ${raw}`));
      if (rawLine < 0) continue;
      references = true;
      const shaRel = entry.findIndex((l) => /^- SHA-256:/.test(l));
      if (shaRel >= 0 && !entry[shaRel].includes(hash)) {
        lines[from + shaRel] = `- SHA-256: ${hash}`;
        if (!fixed.includes(raw)) fixed.push(raw);
      }
    }
    if (!references)
      problems.push(`新增 raw 未被 wiki/log.md 任何摄入条目引用：${raw}`);
  }
  if (fixed.length) await writeFile(logFile, lines.join("\n"));
  return { fixed, problems };
}
// Report-only lint pass; the report is attached to the preview. Returns null
// when python3 is unavailable or INGEST_VALIDATE=off/auto chose to skip. A
// non-zero exit still carries the report on stdout, so keep it.
export async function runEvidenceLint(
  staging: string,
  script: string,
  mode: "auto" | "on" | "off",
): Promise<string | null> {
  if (mode === "off") return null;
  try {
    const { stdout } = await execFileAsync(
      "python3",
      [script, staging, "--strict"],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout.trim() || null;
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    return typeof stdout === "string" && stdout.trim() ? stdout.trim() : null;
  }
}

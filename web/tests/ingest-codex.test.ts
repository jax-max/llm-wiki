import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import {
  codexArgs,
  createCodexAgent,
  type CodexLauncher,
} from "../server/ingest-codex.js";
import { loadConfig, publicConfig } from "../server/config.js";
import type { IngestAgentQuery } from "../server/ingest-sdk.js";
import { IngestStore } from "../server/ingest.js";

const env = {
  LLM_API_KEY: "secret",
  LLM_MODEL: "glm-test",
  LLM_BASE_URL: "http://127.0.0.1:9",
};
const input = (): Parameters<IngestAgentQuery>[0] => ({
  taskPrompt: "file task",
  systemAppend: "ingest methodology",
  cwd: os.tmpdir(),
  model: "",
  baseUrl: "",
  apiKey: "",
  maxTurns: 80,
  abortController: new AbortController(),
});
const fake =
  (script: string): CodexLauncher =>
  (_args, childEnv, cwd) =>
    spawn(process.execPath, ["-e", script], {
      env: childEnv,
      cwd,
      detached: process.platform !== "win32",
      stdio: "pipe",
    });
const collect = async (agent: IngestAgentQuery, i = input()) => {
  const messages = [];
  for await (const message of agent(i)) messages.push(message);
  return messages;
};

test("Codex configuration is independent of query protocol and Claude model", async () => {
  const c = await loadConfig({
    ...env,
    INGEST_ENGINE: "codex",
    LLM_API: "openai-completions",
    INGEST_MODEL: "glm-strong",
  });
  assert.equal(c.ingestAvailable, true);
  assert.equal(c.codexIngestModel, undefined);
  assert.equal(publicConfig(c).ingest.urlSupported, false);
  assert.equal(
    (
      await loadConfig({
        ...env,
        INGEST_ENGINE: "codex",
        INGEST_ENABLED: "false",
      })
    ).ingestAvailable,
    false,
  );
  assert.equal(
    (
      await loadConfig({
        ...env,
        INGEST_ENGINE: "codex",
        CODEX_INGEST_MODEL: "selected",
      })
    ).codexIngestModel,
    "selected",
  );
  await assert.rejects(
    loadConfig({ ...env, INGEST_ENGINE: "other" }),
    /INGEST_ENGINE/,
  );
  const store = new IngestStore(c);
  await assert.rejects(
    store.start({ kind: "url", url: "https://example.com" }),
    /仅支持上传/,
  );
  store.close();
  const args = codexArgs("/tmp/staging with spaces", "");
  assert.ok(!args.includes("--model"));
  assert.ok(args.includes("workspace-write"));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('forced_login_method="chatgpt"'));
  assert.ok(args.includes("sandbox_workspace_write.network_access=false"));
  assert.deepEqual(codexArgs("/tmp/staging", "chosen").slice(-3), [
    "--model",
    "chosen",
    "-",
  ]);
});

test("Codex adapter streams chunked JSONL, sends prompt on stdin and strips API credentials", async (t) => {
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_AUTH_TOKEN", "LLM_API_KEY"]) {
    const previous = process.env[key];
    process.env[key] = "must-not-inherit";
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  let stderr = "";
  const i = input();
  i.onStderr = (data) => {
    stderr += data;
  };
  const agent = createCodexAgent(
    fake(`
    let prompt = ''; process.stdin.on('data', x => prompt += x);
    process.stdin.on('end', () => {
      if (!prompt.includes('ingest methodology') || !prompt.includes('file task')) process.exit(3);
      if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.LLM_API_KEY) process.exit(4);
      process.stderr.write('diagnostic');
      process.stdout.write('{"type":"item.com');
      setTimeout(() => process.stdout.end('pleted","item":{"type":"agent_message","text":"完成"}}\\n{"type":"turn.completed"}'), 10);
    });`),
  );
  const messages = await collect(agent, i);
  assert.equal(stderr, "diagnostic");
  assert.deepEqual(messages, [
    { type: "text", text: "完成" },
    { type: "result", subtype: "success", text: "完成" },
  ]);
});

test("Codex adapter rejects failed turns, nonzero exits, malformed and incomplete output", async () => {
  for (const script of [
    `console.log(JSON.stringify({type:'turn.failed',error:{message:'login required'}}))`,
    `console.log('{"type":"turn.completed"}'); process.exitCode=2`,
    `console.log('bad json')`,
    `console.log('{"type":"thread.started"}')`,
  ])
    await assert.rejects(collect(createCodexAgent(fake(script))));
  const missing: CodexLauncher = () =>
    spawn("/nonexistent/codex", [], { stdio: "pipe" });
  await assert.rejects(collect(createCodexAgent(missing)), /未找到 Codex CLI/);
});

test("Codex adapter waits for process exit on abort", async () => {
  for (const reason of [new Error("cancelled"), new Error("timeout")]) {
    let exited = false;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const launcher: CodexLauncher = (...args) => {
      const child = fake(
        `process.stdout.write('{"type":"thread.started"}\\n'); setInterval(()=>{},1000)`,
      )(...args);
      child.stdout.once("data", () => started());
      child.once("close", () => {
        exited = true;
      });
      return child;
    };
    const i = input();
    const pending = collect(createCodexAgent(launcher), i);
    await ready;
    i.abortController.abort(reason);
    await assert.rejects(pending, reason);
    assert.equal(exited, true);
  }
});

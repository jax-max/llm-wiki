import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { QueryError } from "./wiki.js";
import type { IngestAgentMessage, IngestAgentQuery } from "./ingest-sdk.js";

export function codexArgs(cwd: string, model: string): string[] {
  return [
    "exec",
    "--json",
    "--color",
    "never",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "-C",
    cwd,
    "-c",
    'approval_policy="never"',
    "-c",
    'forced_login_method="chatgpt"',
    "-c",
    'web_search="disabled"',
    "-c",
    "sandbox_workspace_write.network_access=false",
    "-c",
    "sandbox_workspace_write.exclude_tmpdir_env_var=true",
    "-c",
    "sandbox_workspace_write.exclude_slash_tmp=true",
    ...(model ? ["--model", model] : []),
    "-",
  ];
}

// Inject the process launcher for unit tests; no shell interpolation or credentials.
export type CodexLauncher = (
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
) => ChildProcessWithoutNullStreams;
const launch: CodexLauncher = (args, env, cwd) =>
  spawn("codex", args, {
    cwd,
    env,
    stdio: "pipe",
    detached: process.platform !== "win32",
  });

export function createCodexAgent(
  launcher: CodexLauncher = launch,
): IngestAgentQuery {
  return async function* (input) {
    input.abortController.signal.throwIfAborted();
    const env = { ...process.env };
    // Authentication belongs to Codex's ChatGPT login, not the query provider.
    for (const key of Object.keys(env))
      if (
        key.startsWith("ANTHROPIC_") ||
        key.startsWith("OPENAI_") ||
        key === "CODEX_API_KEY" ||
        key === "LLM_API_KEY"
      )
        delete env[key];
    const child = launcher(codexArgs(input.cwd, input.model), env, input.cwd);
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const kill = (signal: NodeJS.Signals) => {
      if (closed) return;
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH")
          child.kill(signal);
      }
    };
    const stop = () => {
      if (closed || killTimer) return;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 2000);
      killTimer.unref();
    };
    const exit = new Promise<{ code: number | null; error?: Error }>(
      (resolve) => {
        let spawnError: Error | undefined;
        child.on("error", (error) => {
          spawnError = error;
        });
        child.on("close", (code) => {
          // The CLI may exit on SIGTERM before its command descendants do.
          if (killTimer) kill("SIGKILL");
          closed = true;
          clearTimeout(killTimer);
          resolve({ code, error: spawnError });
        });
      },
    );
    child.stderr.on("data", (data: Buffer) =>
      input.onStderr?.(data.toString("utf8")),
    );
    // A startup failure may close stdin before its payload has been written.
    child.stdin.on("error", (error) => input.onStderr?.(error.message));
    const abort = () => stop();
    input.abortController.signal.addEventListener("abort", abort, {
      once: true,
    });
    if (input.abortController.signal.aborted) stop();
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let success = false;
    let failure: string | undefined;
    let summary = "";
    try {
      child.stdin.end(
        `${input.systemAppend}\n\n${input.taskPrompt}\n\nUse local file tools only. Do not fetch URLs or use the network. Do not modify existing raw files.\n`,
      );
      for await (const line of lines) {
        if (!line.trim()) continue;
        if (line.length > 1_000_000)
          throw new Error("Codex JSONL event too large");
        const event = JSON.parse(line);
        if (event.type === "turn.completed") success = true;
        if (event.type === "turn.failed" || event.type === "error")
          failure =
            event.error?.message || event.message || "Codex execution failed";
        const item = event.item;
        if (
          item &&
          event.type === "item.completed" &&
          item.type === "agent_message"
        ) {
          summary = String(item.text || "");
          yield { type: "text", text: summary };
        } else if (
          item &&
          (event.type === "item.started" || event.type === "item.completed")
        ) {
          if (item.type === "command_execution")
            yield { type: "tool_use", name: "Bash", input: {} };
          else if (item.type === "file_change")
            for (const change of item.changes || [])
              yield {
                type: "tool_use",
                name: "Write",
                input: { file_path: change.path },
              };
        }
      }
      const result = await exit;
      input.abortController.signal.throwIfAborted();
      if (result.error) {
        if ((result.error as NodeJS.ErrnoException).code === "ENOENT")
          throw new QueryError(
            "sdk",
            "未找到 Codex CLI，请安装并使用 ChatGPT 登录后重试",
            503,
          );
        throw result.error;
      }
      if (result.code !== 0 || failure || !success)
        throw new QueryError(
          "ingest",
          `Codex 摄入失败：${failure || `exit=${result.code}; missing successful completion`}`,
          502,
        );
      yield {
        type: "result",
        subtype: "success",
        text: summary,
      } satisfies IngestAgentMessage;
    } finally {
      input.abortController.signal.removeEventListener("abort", abort);
      lines.close();
      stop();
      await exit; // Never let staging cleanup race a still-running agent.
    }
  };
}

export const codexAgentQuery = createCodexAgent();

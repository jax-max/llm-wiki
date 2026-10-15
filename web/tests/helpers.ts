import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "../server/config.js";
import type { Factory, Session, History } from "../server/agent.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
export const env = {
  LLM_API_KEY: "test-secret",
  LLM_MODEL: "test-model",
  LLM_BASE_URL: "http://127.0.0.1:9/v1",
};
export const config = await loadConfig(env);
const invoke = (tools: ToolDefinition[], name: string, args: unknown) =>
  tools
    .find((t) => t.name === name)!
    .execute("test", args, undefined, undefined, {} as never);
export function fakeFactory(
  options: {
    wait?: boolean;
    error?: string;
    noTools?: boolean;
    answer?: string;
    delay?: number;
  } = {},
  seen: History[] = [],
): Factory {
  return async (_c, prompt, tools, history) => {
    assert.match(prompt, /Query the Wiki/);
    assert.match(prompt, /Updated/);
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "read_document",
      "search_wiki",
      "wiki_relations",
    ]);
    seen.push(structuredClone(history));
    const messages: History = structuredClone(history);
    let callback: (event: any) => void = () => {};
    let release: () => void = () => {};
    return {
      messages,
      subscribe: (fn: any) => {
        callback = fn;
        return () => {};
      },
      dispose: () => {},
      abort: async () => release(),
      prompt: async (message: string) => {
        if (options.wait)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (!options.noTools) {
          await invoke(tools, "read_document", { path: "wiki/schema.md" });
          await invoke(tools, "read_document", { path: "wiki/index.md" });
          await invoke(tools, "search_wiki", { query: "活动准入" });
          const p = "wiki/domains/lottery-platform/rules/activity-admission.md";
          await invoke(tools, "read_document", { path: p });
          await invoke(tools, "wiki_relations", { path: p });
        }
        const answer = options.answer || "有依据的回答。";
        for (const delta of answer.match(/.{1,12}/gs) || []) {
          if (options.delay)
            await new Promise<void>((r) => {
              const timer = setTimeout(r, options.delay);
              release = () => {
                clearTimeout(timer);
                r();
              };
            });
          callback({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta },
          });
        }
        messages.push(
          { role: "user", content: message, timestamp: Date.now() },
          {
            role: "assistant",
            content: [{ type: "text", text: answer }],
            api: "anthropic-messages",
            provider: "wiki-local",
            model: "test-model",
            usage: {
              input: 10,
              output: 10,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 20,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: options.error ? "error" : "stop",
            errorMessage: options.error,
            timestamp: Date.now(),
          },
        );
      },
    } as unknown as Session;
  };
}

export async function wikiDigest(root: string) {
  const hash = createHash("sha256");
  const walk = async (relative: string) => {
    for (const entry of (
      await readdir(path.join(root, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = relative + "/" + entry.name;
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) {
        hash.update(p);
        hash.update(await readFile(path.join(root, p)));
      }
    }
  };
  await walk("wiki");
  await walk("raw");
  return hash.digest("hex");
}

import path from "node:path";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { access, stat } from "node:fs/promises";
import dotenv from "dotenv";
import { loadPorts } from "./ports.js";
export const webRoot = fileURLToPath(
  new URL(
    import.meta.url.includes("/dist/") ? "../../" : "../",
    import.meta.url,
  ),
);
export const skillPath = path.resolve(webRoot, "../skills/wiki-query/SKILL.md");
export type Config = {
  root: string;
  wikiId: string;
  name: string;
  api: "anthropic-messages" | "openai-completions";
  baseUrl: string;
  model: string;
  apiKey: string;
  port: number;
  webPort: number;
  timeout: number;
  maxCalls: number;
};
export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Config> {
  const fileEnv =
    env === process.env
      ? dotenv.config({ path: path.join(webRoot, ".env") }).parsed
      : undefined;
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} 必填`);
    return value;
  };
  const integer = (key: string, fallback: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`${key} 必须是 1–${max} 的整数`);
    return value;
  };
  const api = env.LLM_API || "anthropic-messages";
  if (api !== "anthropic-messages" && api !== "openai-completions")
    throw new Error("LLM_API 协议无效");
  const baseUrl = required("LLM_BASE_URL");
  try {
    const url = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw 0;
  } catch {
    throw new Error("LLM_BASE_URL 必须是无凭证、查询和片段的 HTTP(S) 地址");
  }
  const root = path.resolve(webRoot, env.WIKI_ROOT || "../examples/demo-wiki");
  for (const [p, dir] of [
    ["wiki/schema.md", false],
    ["wiki/index.md", false],
    ["wiki/domains", true],
    ["raw", true],
  ] as const) {
    try {
      await access(
        path.join(root, p),
        constants.R_OK | (dir ? constants.X_OK : 0),
      );
      const s = await stat(path.join(root, p));
      if (dir ? !s.isDirectory() : !s.isFile()) throw 0;
    } catch {
      throw new Error(`WIKI_ROOT 缺少可读${dir ? "目录" : "文件"}：${p}`);
    }
  }
  return {
    root,
    wikiId: env.WIKI_ID?.trim() || "default",
    name: env.WIKI_NAME?.trim() || path.basename(root),
    api,
    baseUrl,
    model: required("LLM_MODEL"),
    apiKey: required("LLM_API_KEY"),
    ...loadPorts({ ...env, ...fileEnv }),
    timeout: integer("QUERY_TIMEOUT_MS", 180000, 3600000),
    maxCalls: integer("QUERY_MAX_TOOL_CALLS", 30, 1000),
  };
}
export const publicConfig = (c: Config) => ({
  wikiId: c.wikiId,
  name: c.name,
  model: c.model,
  api: c.api,
});

import { QueryError } from "./wiki.js";
import type { Config } from "./config.js";
export type IngestInput =
  | { kind: "url"; url: string }
  | { kind: "file"; filename: string; text: string };
export function validateUrl(url: unknown): string {
  if (typeof url !== "string" || !url.trim())
    throw new QueryError("url", "缺少来源 URL");
  const trimmed = url.trim();
  if (trimmed.length > 2000) throw new QueryError("url", "URL 过长");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new QueryError("url", "URL 无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new QueryError("url", "URL 必须是 http(s) 地址");
  if (parsed.username || parsed.password)
    throw new QueryError("url", "URL 不得携带用户名或密码");
  return trimmed;
}
// Uploads keep their own raw domain so user files never masquerade as
// crawled site content; same-day collisions get an -N suffix instead of
// overwriting, because raw/ is append-only evidence.
export async function rawPathForUpload(
  filename: string,
  today: string,
  exists: (candidate: string) => boolean | Promise<boolean>,
): Promise<string> {
  const stem =
    filename
      .replace(/\.(md|txt)$/i, "")
      .replace(/[\u0000-\u001f\\/:*?"<>|]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "upload";
  const slug = stem.toLowerCase();
  let candidate = `raw/uploads/${today}-${slug}.md`;
  for (let n = 2; await exists(candidate); n++) {
    candidate = `raw/uploads/${today}-${slug}-${n}.md`;
  }
  return candidate;
}
export async function readIngestInput(
  req: {
    headers: Record<string, unknown>;
    body: unknown;
  },
  c: Config,
  checkWiki: (id: unknown) => void,
): Promise<IngestInput> {
  // Content-Type values are case-insensitive; express.raw's type-is matcher
  // already tolerates case, so the branch check must too.
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    if (typeof req.body !== "object" || req.body === null)
      throw new QueryError("url", "请求体无效");
    checkWiki((req.body as Record<string, unknown>).wikiId);
    return {
      kind: "url",
      url: validateUrl((req.body as Record<string, unknown>).url),
    };
  }
  // express.raw() has buffered the body; undici parses multipart natively.
  if (!Buffer.isBuffer(req.body))
    throw new QueryError("upload", "上传请求体无效");
  let form: FormData;
  try {
    form = await new Request("http://ingest.local", {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Uint8Array(req.body),
    }).formData();
  } catch {
    throw new QueryError("upload", "上传请求体解析失败");
  }
  checkWiki(form.get("wikiId"));
  const file = form.get("file");
  if (!(file instanceof File))
    throw new QueryError("upload", "缺少上传文件（file 字段）");
  if (!/\.(md|txt)$/i.test(file.name))
    throw new QueryError("upload", "仅支持 .md / .txt 文件");
  const text = await file.text();
  if (text.includes("\0")) throw new QueryError("upload", "文件包含非法字符");
  if (!text.trim()) throw new QueryError("upload", "文件内容为空");
  // Strip control characters and quotes: the name lands inside the raw
  // template's `> Source: uploaded file "…"` header line.
  const filename = file.name.replace(/[\u0000-\u001f"]/g, "").trim();
  if (!filename) throw new QueryError("upload", "文件名无效");
  return { kind: "file", filename, text };
}

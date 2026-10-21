import { MAX_DOCUMENT_BYTES, QueryError } from "./wiki.js";
import type { Config } from "./config.js";
import { DOCUMENT_LIMITS, parseDocument } from "./ingest-document.js";
export type IngestInput =
  | { kind: "url"; url: string }
  | { kind: "file"; filename: string; text: string };

export function rawContentForUpload(
  filename: string,
  text: string,
  today: string,
): string {
  const title = filename.replace(/\.(md|txt|docx|pdf|pptx)$/i, "");
  return `# ${title}\n\n> Source: uploaded file "${filename}"\n> Collected: ${today}\n> Published: Unknown\n\n${text}\n`;
}
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
      .replace(/\.(md|txt|docx|pdf|pptx)$/i, "")
      .replace(/[\u0000-\u001f\\/:*?"<>|%#]/g, "")
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
  signal?: AbortSignal,
): Promise<IngestInput> {
  signal?.throwIfAborted();
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
  const extension = file.name
    .match(/\.(md|txt|docx|pdf|pptx)$/i)?.[1]
    ?.toLowerCase();
  if (!extension)
    throw new QueryError(
      "upload_format",
      "仅支持 .md / .txt / .docx / .pdf / .pptx 文件",
    );
  if (file.size > c.ingestMaxUploadMb * 1024 * 1024)
    throw new QueryError("upload", "上传文件超过大小限制", 413);
  if (
    (extension === "md" || extension === "txt") &&
    file.size > MAX_DOCUMENT_BYTES
  )
    throw new QueryError(
      "upload_limit",
      "原始资料超过 8 MB 阅读限制，请拆分后重试",
    );
  // Validate the name before starting potentially expensive binary parsing.
  // The name lands in the raw template's quoted Source header.
  const filename = file.name.replace(/[\u0000-\u001f"]/g, "").trim();
  if (!filename) throw new QueryError("upload", "文件名无效");
  const text =
    extension === "md" || extension === "txt"
      ? await file.text()
      : await parseDocument(
          extension as "docx" | "pdf" | "pptx",
          new Uint8Array(await file.arrayBuffer()),
          DOCUMENT_LIMITS,
          signal,
        );
  signal?.throwIfAborted();
  if (text.includes("\0")) throw new QueryError("upload", "文件包含非法字符");
  if (!text.trim()) throw new QueryError("upload", "文件内容为空");
  const raw = rawContentForUpload(
    filename,
    text,
    new Date().toISOString().slice(0, 10),
  );
  if (Buffer.byteLength(raw, "utf8") > MAX_DOCUMENT_BYTES)
    throw new QueryError(
      "upload_limit",
      "转换后的原始资料超过 8 MB 阅读限制，请拆分后重试",
    );
  return { kind: "file", filename, text };
}

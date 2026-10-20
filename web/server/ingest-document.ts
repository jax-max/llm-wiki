import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { QueryError } from "./wiki.js";

export const DOCUMENT_LIMITS = {
  timeoutMs: 60_000,
  maxTextChars: 2_000_000,
  maxUncompressedBytes: 100 * 1024 * 1024,
};
export type DocumentRequest = {
  format: "docx" | "pdf" | "pptx";
  bytes: Uint8Array;
  limits: typeof DOCUMENT_LIMITS;
};
export type DocumentResult =
  | { text: string }
  | { code: string; message: string };

let parsing = false;

// Binary parsing is bounded and isolated from the HTTP event loop. Only one
// parser runs at a time, including the period before IngestStore reserves a job.
export async function parseDocument(
  format: DocumentRequest["format"],
  bytes: Uint8Array,
  limits = DOCUMENT_LIMITS,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new QueryError("cancelled", "文档解析已取消");
  if (parsing)
    throw new QueryError("busy", "已有文档正在解析，请稍后再试", 409);
  parsing = true;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const compiled = new URL("./ingest-document-worker.js", import.meta.url);
    const options = {
      workerData: { format, bytes, limits } satisfies DocumentRequest,
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    };
    worker = existsSync(compiled)
      ? new Worker(compiled, options)
      : new Worker(
          // Node's Worker does not apply tsx's resolver to its entry point.
          `import('tsx/esm/api').then(({ tsImport }) => tsImport(${JSON.stringify(new URL("./ingest-document-worker.ts", import.meta.url).href)}, ${JSON.stringify(import.meta.url)}));`,
          { ...options, eval: true },
        );
    return await new Promise<string>((resolve, reject) => {
      onAbort = () => reject(new QueryError("cancelled", "文档解析已取消"));
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      timer = setTimeout(
        () =>
          reject(
            new QueryError("upload_timeout", "文档解析超时，请拆分后重试"),
          ),
        limits.timeoutMs,
      );
      worker!.once("message", (result: DocumentResult) => {
        if ("text" in result) resolve(result.text);
        else reject(new QueryError(result.code, result.message));
      });
      worker!.once("error", (error: NodeJS.ErrnoException) =>
        reject(
          new QueryError(
            error.code === "ERR_WORKER_OUT_OF_MEMORY"
              ? "upload_limit"
              : "upload_corrupt",
            "无法解析文档，请检查文件或拆分后重试",
          ),
        ),
      );
      worker!.once("exit", () =>
        reject(
          new QueryError(
            "upload_corrupt",
            "文档解析未完成，请检查文件或拆分后重试",
          ),
        ),
      );
    });
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    try {
      await worker?.terminate();
    } finally {
      parsing = false;
    }
  }
}

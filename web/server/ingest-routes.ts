import express from "express";
import type { Config } from "./config.js";
import { QueryError } from "./wiki.js";
import { readIngestInput } from "./ingest-upload.js";
import type { IngestStore } from "./ingest.js";
export function registerIngestRoutes(
  app: express.Express,
  c: Config,
  store: IngestStore,
) {
  const checkWiki = (id: unknown) => {
    if (id !== c.wikiId) throw new QueryError("wiki", "知识库标识不匹配", 400);
  };
  // The global express.json only handles JSON; multipart bodies are buffered
  // here and parsed by undici inside readIngestInput.
  app.post(
    "/api/ingest",
    express.raw({
      type: "multipart/form-data",
      limit: `${c.ingestMaxUploadMb}mb`,
    }),
    async (req, res, next) => {
      try {
        const input = await readIngestInput(req, c, checkWiki);
        const job = await store.start(input);
        res
          .status(202)
          .json({ jobId: job.id, status: job.status, notices: job.notices });
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/api/ingest/:id/events", (req, res) => {
    const id = req.params.id;
    const job = store.get(id);
    if (!job)
      return res.status(404).json({ error: "摄入任务不存在", code: "missing" });
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    // Closing this stream never aborts the job — clients reconnect by id.
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const emit = (event: string, data: unknown) => {
      if (!res.destroyed && !res.writableEnded)
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (
        event === "error" ||
        (event === "status" &&
          ["applied", "discarded", "cancelled"].includes(
            (data as { status?: string }).status || "",
          ))
      ) {
        clearInterval(heartbeat);
        res.end();
      }
    };
    const unsubscribe = store.subscribe(id, emit);
    heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": keepalive\n\n");
    }, 15000);
    if (
      ["applied", "discarded", "cancelled", "error"].includes(job.status) &&
      !res.writableEnded
    )
      res.end(); // replay already delivered the terminal event
    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  app.get("/api/ingest/:id/preview", (req, res, next) => {
    try {
      const job = store.get(req.params.id);
      if (!job) throw new QueryError("missing", "摄入任务不存在", 404);
      if (job.status !== "preview")
        throw new QueryError("state", "任务不在预览状态", 409);
      res.json(store.previewData(job));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/ingest/:id/apply", async (req, res, next) => {
    try {
      res.json({ applied: await store.apply(req.params.id) });
    } catch (error) {
      next(error);
    }
  });
  app.delete("/api/ingest/:id", (req, res) => {
    if (!store.get(req.params.id))
      return res.status(404).json({ error: "摄入任务不存在", code: "missing" });
    if (!store.cancel(req.params.id))
      return res
        .status(409)
        .json({ error: "任务已结束，无法取消", code: "state" });
    res.status(204).end();
  });
}

import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { publicConfig, webRoot, type Config } from "./config.js";
import { runQuery, type Factory, type History } from "./agent.js";
import { Wiki, QueryError } from "./wiki.js";
import { IngestStore } from "./ingest.js";
import { registerIngestRoutes } from "./ingest-routes.js";
import { claudeAgentQuery, type IngestAgentQuery } from "./ingest-sdk.js";
type Conversation = {
  wikiId: string;
  history: History;
  lastUsed: number;
  controller?: AbortController;
};
export function createApp(
  c: Config,
  factory?: Factory,
  ingestAgent: IngestAgentQuery = claudeAgentQuery,
) {
  const app = express();
  app.disable("x-powered-by");
  const sessions = new Map<string, Conversation>();
  const ingest = new IngestStore(c, ingestAgent);
  const cleanup = setInterval(() => {
    for (const [id, s] of sessions)
      if (!s.controller && Date.now() - s.lastUsed > 30 * 60 * 1000)
        sessions.delete(id);
    ingest.sweep();
  }, 60000);
  cleanup.unref();
  const close = () => {
    clearInterval(cleanup);
    for (const s of sessions.values())
      s.controller?.abort(new QueryError("cancelled", "服务停止"));
    sessions.clear();
    ingest.close();
  };
  app.use((req, res, next) => {
    const hosts = new Set([`127.0.0.1:${c.port}`, `localhost:${c.port}`]);
    const origins = new Set([...hosts].map((h) => "http://" + h));
    if (process.env.NODE_ENV !== "production") {
      origins.add(`http://127.0.0.1:${c.webPort}`);
      origins.add(`http://localhost:${c.webPort}`);
      hosts.add(`127.0.0.1:${c.webPort}`);
      hosts.add(`localhost:${c.webPort}`);
    }
    if (
      !hosts.has(req.headers.host || "") ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res.status(403).json({ error: "拒绝非本地来源请求" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.get("/healthz", (_req, res) => res.json({ ready: true }));
  app.get("/api/config", (_req, res) => res.json(publicConfig(c)));
  const checkWiki = (id: unknown) => {
    if (id !== c.wikiId) throw new QueryError("wiki", "知识库标识不匹配", 400);
  };
  app.get("/api/document", async (req, res, next) => {
    try {
      checkWiki(req.query.wikiId);
      if (typeof req.query.path !== "string")
        throw new QueryError("path", "缺少来源路径");
      const doc = await new Wiki(c.root).read(
        req.query.path,
        Number(req.query.offset || 0),
        50000,
      );
      res.json(doc);
    } catch (e) {
      next(e);
    }
  });
  app.delete("/api/chat/:sessionId", (req, res) => {
    const s = sessions.get(req.params.sessionId);
    s?.controller?.abort(new QueryError("cancelled", "对话已结束"));
    sessions.delete(req.params.sessionId);
    res.status(204).end();
  });
  app.post("/api/chat", async (req, res, next) => {
    let s: Conversation;
    let id: string;
    try {
      checkWiki(req.body?.wikiId);
      if (
        typeof req.body.message !== "string" ||
        !req.body.message.trim() ||
        req.body.message.length > 16000
      )
        throw new QueryError("message", "问题必须为 1–16000 个字符");
      if (
        req.body.sessionId !== undefined &&
        typeof req.body.sessionId !== "string"
      )
        throw new QueryError("session", "会话标识无效");
      id = req.body.sessionId || randomUUID();
      const existing = sessions.get(id);
      if (
        req.body.sessionId &&
        (!existing ||
          (Date.now() - existing.lastUsed > 30 * 60 * 1000 &&
            !existing.controller))
      )
        throw new QueryError("session", "会话已过期，请新建对话", 404);
      s = existing || { wikiId: c.wikiId, history: [], lastUsed: Date.now() };
      if (s.wikiId !== c.wikiId)
        throw new QueryError("wiki", "会话知识库不匹配");
      if (s.controller) throw new QueryError("busy", "该会话正在生成", 409);
      if (sessions.size >= 100 && !existing)
        throw new QueryError(
          "capacity",
          "会话数量达到上限，请释放闲置会话",
          429,
        );
      s.controller = new AbortController();
      sessions.set(id, s);
    } catch (e) {
      next(e);
      return;
    }
    const controller = s.controller;
    const requestId = randomUUID();
    const started = Date.now();
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const emit = (event: string, data: unknown) => {
      if (!res.destroyed && !res.writableEnded)
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === "progress") {
        const p = data as { tool: string; path?: string; query?: string };
        console.info(
          JSON.stringify({
            requestId,
            tool: p.tool,
            path: p.path,
            query: p.query,
          }),
        );
      }
    };
    const disconnected = () => {
      if (!res.writableEnded)
        controller.abort(new QueryError("cancelled", "生成已停止"));
    };
    res.on("close", disconnected);
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": keepalive\n\n");
    }, 15000);
    emit("session", { sessionId: id });
    try {
      s.history = await runQuery(
        c,
        req.body.message,
        s.history,
        controller,
        emit,
        factory,
      );
      emit("done", {});
    } catch (error) {
      const e =
        error instanceof QueryError
          ? error
          : new QueryError("query", "查询失败，请检查服务配置后重试", 500);
      emit("error", { code: e.code, message: e.message });
      console.info(
        JSON.stringify({ requestId, error: e.code, detail: e.message }),
      );
    } finally {
      clearInterval(heartbeat);
      res.off("close", disconnected);
      s.controller = undefined;
      s.lastUsed = Date.now();
      res.end();
      console.info(
        JSON.stringify({ requestId, durationMs: Date.now() - started }),
      );
    }
  });
  registerIngestRoutes(app, c, ingest);
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use(express.static(path.join(webRoot, "dist/client")));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(webRoot, "dist/client/index.html")),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const tooLarge =
        (error as { type?: string } | null)?.type === "entity.too.large";
      const e =
        error instanceof QueryError
          ? error
          : tooLarge
            ? new QueryError("upload", "上传文件超过大小限制", 413)
            : new QueryError("request", "请求无效", 400);
      res.status(e.status).json({ error: e.message, code: e.code });
    },
  );
  return { app, close, sessions, ingest };
}

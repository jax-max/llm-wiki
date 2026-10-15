import { test } from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { config, fakeFactory } from "./helpers.js";
import { readSSE } from "../src/sse.js";
import type { History } from "../server/agent.js";
async function serve(options: Parameters<typeof fakeFactory>[0] = {}) {
  const seen: History[] = [];
  const localConfig = { ...config };
  const ctx = createApp(localConfig, fakeFactory(options, seen));
  const server = ctx.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address() as { port: number };
  localConfig.port = addr.port;
  const request = (url: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${addr.port}${url}`, {
      ...init,
      headers: { Host: `127.0.0.1:${config.port}`, ...init.headers },
    });
  const badHost = () =>
    new Promise<number>((resolve) => {
      http.get(
        {
          host: "127.0.0.1",
          port: addr.port,
          path: "/healthz",
          headers: { host: "evil.test" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
    });
  return {
    ...ctx,
    request,
    badHost,
    seen,
    stop: async () => {
      ctx.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
const body = (sessionId?: string) =>
  JSON.stringify({
    wikiId: config.wikiId,
    message: "用户参与条件？",
    sessionId,
  });
const post = (sessionId?: string) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body(sessionId),
});
test("HTTP config, document, host and origin boundaries, ordered SSE and followup", async () => {
  const s = await serve();
  try {
    assert.equal((await s.request("/healthz")).status, 200);
    assert.ok(
      !(await (await s.request("/api/config")).text()).includes("test-secret"),
    );
    assert.equal(await s.badHost(), 403);
    assert.equal(
      (
        await s.request("/healthz", {
          headers: { Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await s.request("/api/document?wikiId=wrong&path=wiki/index.md")).status,
      400,
    );
    assert.equal(
      (await s.request("/api/document?wikiId=default&path=wiki/index.md"))
        .status,
      200,
    );
    assert.equal((await s.request("/api/chat", post("missing"))).status, 404);
    const events: string[] = [];
    let id = "";
    await readSSE(await s.request("/api/chat", post()), (e, d) => {
      events.push(e);
      if (e === "session") id = d.sessionId;
    });
    assert.equal(events[0], "session");
    assert.equal(events.at(-1), "done");
    await readSSE(await s.request("/api/chat", post(id)), () => {});
    assert.equal(s.seen[1].length, 2);
    assert.equal(
      (await s.request("/api/chat/" + id, { method: "DELETE" })).status,
      204,
    );
    assert.equal((await s.request("/api/chat", post(id))).status, 404);
  } finally {
    await s.stop();
  }
});
test("concurrent submission conflicts; disconnect cancels and retry restores completed turns only", async () => {
  const s = await serve({ wait: true });
  try {
    const abort = new AbortController();
    const response = await s.request("/api/chat", {
      ...post(),
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    const id = JSON.parse(chunk.match(/data: (.*)/)![1]).sessionId;
    assert.equal((await s.request("/api/chat", post(id))).status, 409);
    abort.abort();
    await reader.cancel().catch(() => {});
    for (let i = 0; i < 50 && s.sessions.get(id)?.controller; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(s.sessions.get(id)?.controller, undefined);
    assert.deepEqual(s.sessions.get(id)?.history, []);
    const again = await s.request("/api/chat", post(id));
    assert.equal(again.status, 200);
    await s.request("/api/chat/" + id, { method: "DELETE" });
    await again.text();
    assert.equal(s.sessions.has(id), false);
  } finally {
    await s.stop();
  }
});
test("expired session, failed retry, stream error and parser truncation", async () => {
  const s = await serve({ error: "provider unavailable" });
  try {
    let id = "";
    const events: string[] = [];
    await readSSE(await s.request("/api/chat", post()), (e, d) => {
      events.push(e);
      if (e === "session") id = d.sessionId;
    });
    assert.equal(events.at(-1), "error");
    assert.equal(s.sessions.get(id)!.history.length, 0);
    await readSSE(await s.request("/api/chat", post(id)), () => {});
    assert.equal(s.seen[1].length, 0);
    s.sessions.get(id)!.lastUsed = 0;
    assert.equal((await s.request("/api/chat", post(id))).status, 404);
    await assert.rejects(
      readSSE(new Response('event: delta\ndata: {"text":"hi"}\n\n'), () => {}),
      /中断/,
    );
  } finally {
    await s.stop();
  }
});

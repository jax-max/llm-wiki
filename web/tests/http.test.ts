import { test } from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { config, fakeFactory } from "./helpers.js";
import { readSSE } from "../src/sse.js";
import type { History } from "../server/agent.js";
async function serve(
  options: Parameters<typeof fakeFactory>[0] = {},
  selectionFile?: string,
) {
  const seen: History[] = [];
  const localConfig = { ...config };
  const ctx = createApp(
    localConfig,
    fakeFactory(options, seen),
    undefined,
    selectionFile,
  );
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
    const catalog = await s.request(`/api/catalog?wikiId=${config.wikiId}`);
    assert.equal(catalog.status, 200);
    assert.match(catalog.headers.get("cache-control") || "", /no-store/);
    const listing = await catalog.json();
    assert.ok(
      listing.pages.some((p: { path: string }) => p.path === "wiki/index.md"),
    );
    assert.ok(listing.pages.every((p: object) => !("text" in p)));
    assert.ok(!JSON.stringify(listing).includes(config.root));
    assert.equal((await s.request("/api/catalog?wikiId=wrong")).status, 409);
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
      409,
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

test("Wiki switching updates all reads, rejects stale clients and persists selection", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, realpath, rm } = await import(
    "node:fs/promises"
  );
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");
  const base = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "wiki-http-select-")),
  );
  const selectionFile = path.join(base, "state/selection.json");
  const root = path.join(base, "中文 Wiki");
  await mkdir(path.join(root, "wiki/domains"), { recursive: true });
  await mkdir(path.join(root, "raw"));
  await writeFile(path.join(root, "wiki/schema.md"), "# Schema");
  await writeFile(path.join(root, "wiki/index.md"), "# Selected Wiki");
  const s = await serve({}, selectionFile);
  const select = (p: string, wikiId = config.wikiId, headers = {}) =>
    s.request("/api/wiki/select", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ path: p, wikiId }),
    });
  try {
    const listing = await (
      await s.request("/api/directories?" + new URLSearchParams({ path: base }))
    ).json();
    assert.ok(
      listing.directories.some((d: { path: string }) => d.path === root),
    );
    assert.equal(
      (await select(root, config.wikiId, { Origin: "https://evil.test" }))
        .status,
      403,
    );
    assert.equal((await select(base)).status, 400);
    assert.equal(
      (await (await s.request("/api/config")).json()).wikiId,
      config.wikiId,
    );
    // Pending previews remain blockers even if their dialog is closed.
    (s.ingest as any).jobs.set("pending", {
      id: "pending",
      status: "preview",
      lastUsed: Date.now(),
    });
    const pending = await s.request(
      `/api/ingest/pending?wikiId=${config.wikiId}`,
    );
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).job.id, "pending");
    assert.equal((await select(root)).status, 409);
    assert.equal(
      (await s.request("/api/ingest/pending?wikiId=stale")).status,
      409,
    );
    assert.equal(
      (
        await s.request("/api/ingest/pending", {
          headers: { Origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await s.request("/api/ingest/pending", { method: "DELETE" })).status,
      204,
    );
    assert.equal(
      (await s.request("/api/ingest/pending", { method: "DELETE" })).status,
      204,
    );
    const selected = await select(root);
    assert.equal(selected.status, 200);
    const next = await selected.json();
    assert.equal(next.root, root);
    assert.notEqual(next.wikiId, config.wikiId);
    assert.equal(
      (await (await s.request("/api/config")).json()).name,
      "中文 Wiki",
    );
    assert.equal(JSON.parse(await readFile(selectionFile, "utf8")).root, root);
    assert.equal(
      (await s.request(`/api/catalog?wikiId=${config.wikiId}`)).status,
      409,
    );
    assert.equal((await select(config.root)).status, 409);
    const doc = await s.request(
      "/api/document?" +
        new URLSearchParams({ wikiId: next.wikiId, path: "wiki/index.md" }),
    );
    assert.match((await doc.json()).text, /Selected Wiki/);
    const same = await (await select(root, next.wikiId)).json();
    assert.equal(same.wikiId, next.wikiId);
    // A failed disk write must not change the active Wiki.
    await rm(path.dirname(selectionFile), { recursive: true });
    await writeFile(path.dirname(selectionFile), "blocked");
    assert.equal((await select(config.root, next.wikiId)).status, 500);
    assert.equal((await (await s.request("/api/config")).json()).root, root);
  } finally {
    await s.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test("an active query blocks Wiki selection until cancellation settles", async () => {
  const s = await serve({ wait: true });
  try {
    const response = await s.request("/api/chat", post());
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const sessionId = JSON.parse(first.match(/data: (.+)/)![1]).sessionId;
    const select = () =>
      s.request("/api/wiki/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: config.root, wikiId: config.wikiId }),
      });
    assert.equal((await select()).status, 409);
    await s.request(`/api/chat/${sessionId}`, { method: "DELETE" });
    while (!(await reader.read()).done) {
      /* wait for query cleanup */
    }
    reader.releaseLock();
    assert.equal((await select()).status, 200);
  } finally {
    await s.stop();
  }
});

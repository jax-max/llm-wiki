import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "http://127.0.0.1:3002",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const { default: App } = await import("../src/App.js");
const flush = () => new Promise((r) => setTimeout(r, 0));
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test("chat UI streams, stops, retries, follows citations and resets conversation", async () => {
  const calls: { url: string; body: any }[] = [];
  let attempt = 0;
  let stopped = false;
  let pendingStream: ReadableStreamDefaultController<Uint8Array>;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url === "/api/config")
      return Response.json({
        wikiId: "default",
        name: "Demo wiki",
        model: "fixture",
      });
    if (url.startsWith("/api/document")) {
      const p = new URL(url, "http://localhost").searchParams.get("path");
      if (p?.endsWith("missing.md"))
        return Response.json(
          { error: "路径越界 wiki/internal.md", code: "path" },
          { status: 400 },
        );
      return Response.json({
        path: p,
        title: p?.startsWith("raw") ? "原始依据" : "活动准入",
        text: p?.startsWith("raw")
          ? "# 原始依据\n已验证的原文"
          : "# 活动准入\n[原始依据](../../../../raw/source.md)\n[断链](missing.md)",
        nextOffset: null,
        total: 20,
      });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url === "/api/chat") {
      attempt++;
      if (attempt === 1)
        return new Response(
          new ReadableStream({
            start(controller) {
              pendingStream = controller;
              controller.enqueue(
                new TextEncoder().encode(
                  frame("session", { sessionId: "s1" }) +
                    frame("progress", {
                      tool: "read_document",
                      path: "wiki/domains/x/rules/a.md",
                      label: "technical label",
                      documentTitle: "活动准入",
                    }),
                ),
              );
              init?.signal?.addEventListener("abort", () => {
                stopped = true;
                controller.error(new DOMException("Aborted", "AbortError"));
              });
            },
          }),
        );
      return new Response(
        frame("session", { sessionId: "s1" }) +
          frame("delta", {
            text: "有依据的回答：[活动准入](wiki/domains/x/rules/a.md)",
          }) +
          frame("done", {}),
      );
    }
    throw new Error("Unexpected request " + url);
  };
  const root = createRoot(document.getElementById("root")!);
  const click = async (element: Element | undefined | null) => {
    assert.ok(element);
    await act(async () => {
      element.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
      await flush();
    });
  };
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find((e) =>
      e.textContent?.includes(text),
    );
  try {
    await act(async () => {
      root.render(React.createElement(App));
      await flush();
    });
    assert.match(document.body.textContent!, /Demo wiki/);
    assert.match(document.body.textContent!, /知识库问答/);
    assert.doesNotMatch(document.body.textContent!, /fixture|只读/);
    await click(button("用户参与抽奖需要满足什么条件"));
    assert.match(document.body.textContent!, /正在阅读《活动准入》/);
    assert.doesNotMatch(
      document.body.textContent!,
      /wiki\/domains|technical label|read_document/,
    );
    await act(async () => {
      pendingStream.enqueue(
        new TextEncoder().encode(frame("delta", { text: "部分回答" })),
      );
      await flush();
    });
    assert.match(document.body.textContent!, /部分回答/);
    assert.match(document.body.textContent!, /正在整理回答/);
    assert.ok(button("停止生成"));
    await click(button("停止生成"));
    assert.ok(stopped);
    assert.match(document.body.textContent!, /已停止生成，可以重试或继续提问/);
    await click(button("重试本轮"));
    assert.equal(
      calls.filter((c) => c.url === "/api/chat")[1].body.sessionId,
      "s1",
    );
    assert.equal(document.querySelectorAll(".question").length, 1);
    await click(document.querySelector(".markdown a"));
    assert.match(document.querySelector("aside")!.textContent!, /活动准入/);
    await click(
      [...document.querySelectorAll("aside a")].find(
        (e) => e.textContent === "原始依据",
      ),
    );
    assert.match(document.querySelector("aside")!.textContent!, /已验证的原文/);
    await click(button("返回"));
    assert.match(document.querySelector("aside")!.textContent!, /活动准入/);
    assert.doesNotMatch(
      document.querySelector("aside")!.textContent!,
      /wiki\/domains/,
    );
    await click(
      [...document.querySelectorAll("aside a")].find(
        (e) => e.textContent === "断链",
      ),
    );
    assert.match(
      document.querySelector("aside")!.textContent!,
      /暂时无法打开这份资料/,
    );
    assert.doesNotMatch(
      document.querySelector("aside")!.textContent!,
      /路径越界|internal.md/,
    );
    await click(button("新建对话"));
    assert.equal(document.querySelectorAll(".question").length, 0);
    assert.ok(
      calls.some((c) => c.url === "/api/chat/s1" && c.body === undefined),
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});

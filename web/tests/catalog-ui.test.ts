// Client tests: user executes npm run test:client. No live model required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { STORAGE_KEY } from "../src/i18n/index.js";
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "http://localhost",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.defineProperty(dom.window, "innerWidth", {
  value: 1400,
  configurable: true,
});
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("../src/App.js");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function click(element: Element | undefined | null) {
  assert.ok(element);
  await act(async () => {
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
    await flush();
  });
}
async function enter(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await flush();
  });
}
const button = (text: string, parent: ParentNode = document) =>
  [...parent.querySelectorAll("button")].find(
    (e) => e.textContent?.trim() === text,
  );
const a = {
  path: "wiki/rules/a.md",
  title: "旧规则",
  type: "Rule",
};
const b = {
  path: "wiki/rules/b.md",
  title: "新增规则",
  type: "Rule",
};
const overview = { path: "wiki/overview.md", title: "演示领域" };
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const reader = () => document.querySelector<HTMLElement>(".knowledge-content")!;
const chat = () => document.getElementById("knowledge-chat")!;

test("catalog is the only navigation; groups only expand and documents open in the reader", async () => {
  const originalFetch = globalThis.fetch;
  const documentRequests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/config")
      return Response.json({ wikiId: "default", name: "Demo" });
    if (url.startsWith("/api/catalog"))
      return Response.json({
        pages: [overview, a, b, { path: "raw/source.md", title: "原文" }],
      });
    documentRequests.push(url);
    const path = new URL(url, "http://localhost").searchParams.get("path");
    return Response.json({
      path,
      title: a.title,
      text: "# 旧规则\n正文内容",
      total: 10,
      nextOffset: null,
    });
  };
  dom.window.localStorage.setItem(STORAGE_KEY, "zh");
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(React.createElement(App));
      await flush();
    });
    assert.equal(chat().hidden, true);
    assert.equal(document.querySelector('[role="tablist"]'), null);
    const empty = reader().querySelector(".knowledge-empty")!;
    assert.equal(empty.querySelector("button, svg, h1"), null);
    assert.equal(empty.textContent?.trim(), "从左侧目录选择一篇文档");
    assert.equal(document.querySelectorAll(".brand strong").length, 1);
    assert.equal(reader().textContent?.includes("Demo"), false);
    assert.equal(document.querySelector(".library-list"), null);
    assert.equal(document.querySelector(".library-domains"), null);
    assert.equal(reader().querySelector('input[type="search"]'), null);
    const directory = document.getElementById("knowledge-catalog")!;
    const toggle = button(
      "知识目录",
      document.querySelector(".knowledge-toolbar")!,
    )!;
    assert.equal(toggle.getAttribute("aria-controls"), directory.id);
    await click(directory.querySelector('[aria-label="关闭知识目录"]'));
    assert.equal(directory.hidden, true);
    assert.equal(document.activeElement, toggle);
    assert.equal(empty.textContent?.trim(), "点击左上角‘知识目录’开始阅读");
    assert.equal(empty.querySelector("button"), null);
    await click(button("EN"));
    assert.equal(
      empty.textContent?.trim(),
      "Click ‘Knowledge’ at the top left to start reading.",
    );
    await click(toggle);
    assert.equal(directory.hidden, false);
    assert.equal(
      empty.textContent?.trim(),
      "Choose a document from the directory on the left.",
    );
    await click(button("中"));
    assert.equal(empty.textContent?.trim(), "从左侧目录选择一篇文档");

    await click(button("▾ 演示领域", directory));
    assert.equal(
      button("▸ 演示领域", directory)?.getAttribute("aria-expanded"),
      "false",
    );
    await click(button("▸ 演示领域", directory));
    await click(button("▸ 规则", directory));
    assert.equal(documentRequests.length, 0);
    assert.match(reader().textContent!, /从左侧目录选择一篇文档/);
    const filter = directory.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    await enter(filter, "旧规则");
    assert.equal(directory.querySelectorAll(".catalog-page").length, 1);
    await click(button("旧规则", directory));
    assert.match(reader().textContent!, /正文内容/);
    assert.equal(reader().querySelector(".knowledge-empty"), null);
    assert.equal(chat().hidden, true);
    assert.equal(button("返回列表"), undefined);
    assert.equal(document.querySelector(".source-panel"), null);
    assert.equal(
      directory.querySelector('[aria-current="page"]')?.getAttribute("title"),
      a.path,
    );
    reader().scrollTop = 123;
    await enter(filter, "");
    await click(button("▾ 规则", directory));
    await click(button("▸ 原始资料", directory));
    await click(button("▸ 索引与日志", directory));
    assert.match(reader().textContent!, /正文内容/);
    assert.equal(reader().scrollTop, 123);
    assert.equal(documentRequests.length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.localStorage.clear();
  }
});

for (const width of [1400, 390]) {
  test(`Q&A preserves drafts and conversation while citations navigate the reader at ${width}px`, async () => {
    Object.defineProperty(dom.window, "innerWidth", {
      value: width,
      configurable: true,
    });
    const originalFetch = globalThis.fetch;
    let query: Record<string, unknown> | undefined;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/ingest/pending"))
        return Response.json({ job: null });
      if (url === "/api/config")
        return Response.json({ wikiId: "default", name: "Demo" });
      if (url.startsWith("/api/catalog"))
        return Response.json({ pages: [overview, a, b] });
      if (url === "/api/chat") {
        query = JSON.parse(String(init?.body));
        return new Response(
          frame("session", { sessionId: "s1" }) +
            frame("delta", { text: `[证据](${a.path})` }) +
            frame("done", {}),
        );
      }
      const path = new URL(url, "http://localhost").searchParams.get("path");
      return Response.json({
        path,
        title: path === a.path ? a.title : b.title,
        text: path === a.path ? "# 旧规则\n证据正文" : "# 新增规则\n另一篇正文",
        total: 20,
        nextOffset: null,
      });
    };
    dom.window.localStorage.setItem(STORAGE_KEY, "zh");
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => {
        root.render(React.createElement(App));
        await flush();
      });
      assert.equal(
        reader().querySelector(".knowledge-empty")?.textContent?.trim(),
        width < 1280
          ? "点击左上角‘知识目录’开始阅读"
          : "从左侧目录选择一篇文档",
      );
      assert.equal(reader().querySelector("button"), null);
      const ask = button("问知识库", document.querySelector("header")!)!;
      assert.equal(
        document.querySelectorAll('button[aria-controls="knowledge-chat"]')
          .length,
        1,
      );
      assert.equal(button("问知识库", reader()), undefined);
      assert.equal(
        button("问知识库", document.querySelector(".knowledge-toolbar")!),
        undefined,
      );
      assert.equal(ask.getAttribute("aria-expanded"), "false");
      await click(ask);
      assert.equal(chat().hidden, false);
      assert.equal(ask.getAttribute("aria-expanded"), "true");
      assert.equal(
        document.activeElement,
        document.querySelector(".composer textarea"),
      );
      assert.match(chat().textContent!, /整个知识库/);
      await click(document.querySelector(".suggestions button"));
      assert.equal(query?.wikiId, "default");
      assert.ok(!query || (!("path" in query) && !("domain" in query)));
      await enter(
        document.querySelector<HTMLTextAreaElement>(".composer textarea")!,
        "保留草稿",
      );
      await click(document.querySelector(".conversation .markdown a"));
      assert.match(reader().textContent!, /证据正文/);
      assert.equal(chat().hidden, width < 1280);
      if (width < 1280) {
        assert.equal(document.activeElement, reader());
        await click(ask);
      }
      reader().scrollTop = 234;
      const chatScroll = document.querySelector<HTMLElement>(".conversation")!;
      chatScroll.scrollTop = 123;
      await click(ask);
      assert.equal(ask.getAttribute("aria-expanded"), "false");
      assert.equal(document.activeElement, ask);
      assert.equal(chat().hidden, true);
      assert.equal(reader().scrollTop, 234);
      await click(button("问知识库", document.querySelector("header")!));
      assert.equal(chatScroll.scrollTop, 123);
      assert.equal(
        document.querySelector<HTMLTextAreaElement>(".composer textarea")!
          .value,
        "保留草稿",
      );
      assert.equal(document.querySelectorAll(".question").length, 1);
      await click(chat().querySelector('[aria-label="收起问答"]'));
      assert.equal(document.activeElement, ask);
      await click(ask);
      assert.equal(
        document.querySelector<HTMLTextAreaElement>(".composer textarea")!
          .value,
        "保留草稿",
      );
      await act(async () => {
        document
          .querySelector(".composer")!
          .dispatchEvent(
            new dom.window.Event("submit", { bubbles: true, cancelable: true }),
          );
        await flush();
      });
      assert.equal(query?.sessionId, "s1");
      await click(button("新建对话", chat()) || button("＋ 新建对话", chat()));
      assert.match(reader().textContent!, /证据正文/);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = originalFetch;
      dom.window.localStorage.clear();
      Object.defineProperty(dom.window, "innerWidth", {
        value: 1400,
        configurable: true,
      });
    }
  });
}

for (const width of [1400, 1024, 390]) {
  test(`viewing applied changes reveals the catalog and preserves the document after refresh failure at ${width}px`, async () => {
    Object.defineProperty(dom.window, "innerWidth", {
      value: width,
      configurable: true,
    });
    const originalFetch = globalThis.fetch;
    let applied = false,
      catalogCalls = 0;
    let resolveOld!: (response: Response) => void;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/ingest/pending"))
        return Response.json({ job: null });
      if (url === "/api/config")
        return Response.json({
          wikiId: "default",
          name: "Demo",
          ingest: { available: true, maxUploadMb: 2 },
        });
      if (url.startsWith("/api/catalog")) {
        ++catalogCalls;
        if (catalogCalls === 2)
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        if (catalogCalls === 3) return new Response(null, { status: 500 });
        return Response.json({
          pages: [
            overview,
            { ...a, title: applied ? "更新规则" : a.title },
            ...(applied ? [b] : []),
          ],
        });
      }
      if (url.startsWith("/api/document"))
        return Response.json({
          path: a.path,
          title: a.title,
          text: applied ? "新版正文" : "旧版正文",
          nextOffset: null,
          total: 10,
        });
      if (url === "/api/ingest" && init?.method === "POST")
        return Response.json({ jobId: "job", notices: [] }, { status: 202 });
      if (url.endsWith("/events"))
        return new Response(
          frame("done", {
            changes: [
              {
                ...a,
                change: "modified",
                diff: "+新版正文",
                additions: 1,
                deletions: 1,
              },
              {
                ...b,
                change: "added",
                diff: "+新增",
                additions: 1,
                deletions: 0,
              },
              {
                path: "wiki/unapplied.md",
                change: "added",
                diff: "+unused",
                additions: 1,
                deletions: 0,
              },
            ],
          }),
        );
      if (url.endsWith("/apply")) {
        applied = true;
        return Response.json({ applied: [a.path, b.path] });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    dom.window.localStorage.setItem(STORAGE_KEY, "zh");
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => {
        root.render(React.createElement(App));
        await flush();
      });
      const directory = document.getElementById("knowledge-catalog")!;
      if (directory.hidden)
        await click(
          button("知识目录", document.querySelector(".knowledge-toolbar")!),
        );
      await click(button("▸ 规则", directory));
      await click(button("旧规则", directory));
      await click(button("刷新", directory));
      if (directory.hidden)
        await click(
          button("知识目录", document.querySelector(".knowledge-toolbar")!),
        );
      await enter(
        directory.querySelector<HTMLInputElement>('input[type="search"]')!,
        "不会匹配",
      );
      await click(directory.querySelector('[aria-label="关闭知识目录"]'));
      assert.equal(directory.hidden, true);
      assert.equal(
        button("添加资料", document.querySelector(".knowledge-toolbar")!),
        undefined,
      );
      assert.deepEqual(
        [...document.querySelectorAll(".header-actions button")].map((el) =>
          el.textContent?.trim(),
        ),
        ["切换 Wiki", "添加资料", "问知识库", "EN"],
      );
      await click(button("添加资料", document.querySelector("header")!));
      assert.ok(document.querySelector(".ingest-dialog"));
      assert.equal(
        document.querySelector<HTMLInputElement>(
          '.ingest-dialog input[type="file"]',
        )!.accept,
        ".md,.txt,.docx,.pdf,.pptx",
      );
      assert.match(
        document.querySelector(".ingest-dialog")!.textContent!,
        /OCR/,
      );
      await enter(
        document.querySelector<HTMLInputElement>(
          '.ingest-dialog input[type="url"]',
        )!,
        "https://example.com/new",
      );
      await click(button("开始摄入"));
      await click(button("确认写入知识库"));
      assert.match(reader().textContent!, /新版正文/);
      assert.match(
        document.querySelector(".ingest-dialog")!.textContent!,
        /新增 1 项，更新 1 项/,
      );
      assert.equal(chat().hidden, true);
      await act(async () => {
        resolveOld(Response.json({ pages: [] }));
        await flush();
      });
      assert.match(directory.textContent!, /目录加载失败/);
      await click(
        button("查看本次更新", document.querySelector(".ingest-dialog")!),
      );
      assert.equal(directory.hidden, false);
      assert.equal(
        directory.querySelector<HTMLInputElement>('input[type="search"]')!
          .value,
        "",
      );
      const recent = directory.querySelector<HTMLElement>(
        'section[aria-label="本次更新"]',
      )!;
      assert.equal(
        recent.querySelector("button")!.getAttribute("aria-expanded"),
        "true",
      );
      assert.equal(document.activeElement, recent);
      assert.equal(recent.querySelectorAll("li").length, 2);
      assert.match(recent.textContent!, /新增|更新/);
      assert.doesNotMatch(recent.textContent!, /unapplied/);
      assert.match(reader().textContent!, /新版正文/);
      assert.equal(document.querySelector(".library-list"), null);
      await click(recent.querySelector("button"));
      assert.equal(recent.querySelectorAll("li").length, 0);
      assert.match(reader().textContent!, /新版正文/);
      await click(recent.querySelector("button"));
      await click(button("重试", directory));
      assert.match(recent.textContent!, /更新规则|新增规则/);
      await click(button("EN"));
      assert.match(recent.textContent!, /Latest update/);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = originalFetch;
      dom.window.localStorage.clear();
      Object.defineProperty(dom.window, "innerWidth", {
        value: 1400,
        configurable: true,
      });
    }
  });
}

test("late document responses cannot replace a newer selection", async () => {
  const originalFetch = globalThis.fetch;
  let resolveOld!: (response: Response) => void;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/config")
      return Response.json({ wikiId: "default", name: "Demo" });
    if (url.startsWith("/api/catalog"))
      return Response.json({ pages: [overview, a, b] });
    const path = new URL(url, "http://localhost").searchParams.get("path");
    if (path === a.path)
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    return Response.json({
      path: b.path,
      title: b.title,
      text: "当前正文",
      nextOffset: null,
    });
  };
  dom.window.localStorage.setItem(STORAGE_KEY, "zh");
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(React.createElement(App));
      await flush();
    });
    const directory = document.getElementById("knowledge-catalog")!;
    await click(button("▸ 规则", directory));
    await click(button("旧规则", directory));
    await click(button("新增规则", directory));
    await act(async () => {
      resolveOld(
        Response.json({
          path: a.path,
          title: a.title,
          text: "过期正文",
          nextOffset: null,
        }),
      );
      await flush();
    });
    assert.match(reader().textContent!, /当前正文/);
    assert.doesNotMatch(reader().textContent!, /过期正文/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.localStorage.clear();
  }
});

// User executes this interaction regression through npm run test:client.
test("ingest form cannot close or change inputs while upload/extraction is pending", async () => {
  dom.window.localStorage.setItem(STORAGE_KEY, "zh");
  const { default: IngestDialog } = await import(
    "../src/ingest/IngestDialog.js"
  );
  const originalFetch = globalThis.fetch;
  let resolveUpload!: (response: Response) => void;
  globalThis.fetch = async (input) =>
    String(input).startsWith("/api/ingest/pending")
      ? Response.json({ job: null })
      : new Promise<Response>((resolve) => {
          resolveUpload = resolve;
        });
  let closeCalls = 0;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        React.createElement(IngestDialog, {
          wikiId: "default",
          maxUploadMb: 20,
          onClose: () => {
            closeCalls++;
          },
        }),
      );
      await flush();
    });
    const url = document.querySelector<HTMLInputElement>(
      '.ingest-dialog input[type="url"]',
    )!;
    await enter(url, "https://example.com/pending");
    await click(button("开始摄入"));
    const close = document.querySelector<HTMLButtonElement>(
      ".ingest-head button",
    )!;
    assert.equal(close.disabled, true);
    assert.equal(button("取消")!.disabled, true);
    assert.equal(url.disabled, true);
    assert.equal(
      document.querySelector<HTMLInputElement>(
        '.ingest-dialog input[type="file"]',
      )!.disabled,
      true,
    );
    await click(close);
    assert.equal(closeCalls, 0);
    await act(async () => {
      resolveUpload(Response.json({ code: "upload_corrupt" }, { status: 400 }));
      await flush();
    });
    assert.equal(close.disabled, false);
    assert.equal(url.disabled, false);
    assert.match(
      document.querySelector('[role="alert"]')!.textContent!,
      /无法解析文档/,
    );
    await click(close);
    assert.equal(closeCalls, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.localStorage.clear();
  }
});

test("reopening ingestion recovers a pending preview and a failed discard preserves it", async () => {
  dom.window.localStorage.setItem(STORAGE_KEY, "zh");
  const { default: IngestDialog } = await import(
    "../src/ingest/IngestDialog.js"
  );
  const originalFetch = globalThis.fetch;
  let failDelete = true;
  const preview = {
    id: "recovered",
    status: "preview",
    kind: "file",
    source: "source.md",
    changes: [
      {
        path: "wiki/index.md",
        change: "modified",
        additions: 1,
        deletions: 0,
        diff: "+ hello",
      },
    ],
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/ingest/pending"))
      return Response.json({ job: preview });
    if (url.endsWith("/events")) return new Response(frame("done", preview));
    assert.equal(url, "/api/ingest/recovered");
    assert.equal(init?.method, "DELETE");
    return failDelete
      ? Response.json({ code: "busy" }, { status: 409 })
      : new Response(null, { status: 204 });
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        React.createElement(IngestDialog, {
          wikiId: "default",
          maxUploadMb: 20,
          onClose: () => {},
        }),
      );
      await flush();
    });
    assert.ok(button("丢弃本次变更"));
    assert.match(
      document.querySelector(".ingest-diff")?.textContent ||
        document.querySelector(".ingest-dialog")!.textContent!,
      /wiki\/index.md/,
    );
    await click(button("丢弃本次变更"));
    assert.ok(document.querySelector('[role="alert"]'));
    assert.ok(button("丢弃本次变更"));
    assert.equal(document.querySelector(".ingest-done"), null);
    failDelete = false;
    await click(button("丢弃本次变更"));
    assert.ok(document.querySelector(".ingest-done"));
    assert.equal(button("丢弃本次变更"), undefined);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.localStorage.clear();
  }
});

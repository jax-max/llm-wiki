// Client tests are maintained here; run by the user with npm run test:client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
const { createRoot } = await import("react-dom/client");
const { default: WikiSelector } = await import("../src/WikiSelector.js");
const { default: App } = await import("../src/App.js");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === text);
async function click(element: Element | undefined) {
  assert.ok(element);
  await act(async () => {
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
    await flush();
  });
}

test("directory browser navigates, retries blocked selection, switches and keeps same-root selection intact", async () => {
  const originalFetch = globalThis.fetch;
  window.localStorage.setItem("llm-wiki-web.locale", "zh");
  let blocked = true;
  let same = false;
  let switched = 0;
  let closed = 0;
  const browsed: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/directories")) {
      const p = new URL(url, "http://localhost").searchParams.get("path")!;
      browsed.push(p);
      return Response.json({
        path: p,
        parent: "/",
        directories: p === "/A" ? [{ name: "B", path: "/B" }] : [],
      });
    }
    assert.equal(url, "/api/wiki/select");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      path: "/B",
      wikiId: "a",
    });
    return blocked
      ? Response.json({ code: "busy" }, { status: 409 })
      : Response.json({ wikiId: same ? "a" : "b", root: "/B" });
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(
        <WikiSelector
          config={{ wikiId: "a", root: "/A", name: "A" }}
          onClose={() => closed++}
          onSelected={() => switched++}
        />,
      );
      await flush();
    });
    await click(button("B /"));
    assert.deepEqual(browsed, ["/A", "/B"]);
    await click(button("使用此目录"));
    assert.match(
      document.querySelector('[role="alert"]')!.textContent!,
      /先完成或取消/,
    );
    assert.equal(switched, 0);
    blocked = false;
    await click(button("使用此目录"));
    assert.equal(switched, 1);
    same = true;
    await click(button("使用此目录"));
    assert.equal(closed, 1);
    assert.equal(switched, 1);
    await act(async () => {
      document
        .querySelector("dialog")!
        .dispatchEvent(new dom.window.Event("cancel", { cancelable: true }));
    });
    assert.equal(closed, 2);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});

test("switching remounts the workspace and late document responses cannot replace the new Wiki", async () => {
  const originalFetch = globalThis.fetch;
  let selected = false;
  let resolveDocument!: (response: Response) => void;
  const pendingDocument = new Promise<Response>((resolve) => {
    resolveDocument = resolve;
  });
  const catalogIds: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/config")
      return Response.json({
        wikiId: selected ? "b" : "a",
        name: selected ? "Wiki B" : "Wiki A",
        root: selected ? "/B" : "/A",
      });
    if (url.startsWith("/api/catalog")) {
      catalogIds.push(
        new URL(url, "http://localhost").searchParams.get("wikiId")!,
      );
      return Response.json({
        pages: [
          { path: "wiki/index.md", title: selected ? "B index" : "A index" },
        ],
      });
    }
    if (url.startsWith("/api/document")) return pendingDocument;
    if (url.startsWith("/api/directories"))
      return Response.json({ path: "/B", parent: "/", directories: [] });
    if (url === "/api/wiki/select") {
      selected = true;
      return Response.json({ wikiId: "b" });
    }
    throw new Error(url);
  };
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(<App />);
      await flush();
      await flush();
    });
    // Open the system group, then start a document read which finishes after switching.
    const system = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("索引与日志"),
    );
    if (system) await click(system);
    const index = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("A index"),
    );
    assert.ok(index);
    await click(index);
    await click(button("切换 Wiki"));
    await click(button("使用此目录"));
    await act(async () => {
      await flush();
      await flush();
    });
    await act(async () => {
      resolveDocument(
        Response.json({
          path: "wiki/index.md",
          title: "STALE A",
          text: "STALE A",
          nextOffset: null,
          total: 7,
        }),
      );
      await flush();
    });
    assert.match(document.querySelector("header")!.textContent!, /Wiki B/);
    assert.ok(catalogIds.includes("b"));
    assert.ok(
      !document
        .querySelector(".knowledge-content")
        ?.textContent?.includes("STALE A"),
    );
    assert.ok(
      !document
        .querySelector(".knowledge-content")
        ?.textContent?.includes("A index"),
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
});
const { renderMarkdown, sourceLink } = await import("../src/markdown.js");
test("Markdown disables raw HTML, unsafe URLs and remote images", () => {
  const html = renderMarkdown(
    '<img src="https://tracking.test/a" onerror="alert(1)">\n<script>alert(1)</script>\n\n![remote](https://tracking.test/b)\n\n[bad](javascript:alert%281%29)\n\n[good](wiki/index.md)',
  );
  assert.ok(!/<img|<script|javascript:|onerror=/.test(html));
  assert.match(html, /href="wiki\/index.md"/);
  assert.equal(
    sourceLink("../../../../raw/a.md", "wiki/domains/x/rules/a.md").path,
    "raw/a.md",
  );
  for (const href of [
    "javascript:alert(1)",
    "//evil.test",
    "/etc/passwd",
    "../../outside.md",
    "%6aavascript:alert(1)",
  ])
    assert.throws(() => sourceLink(href));
  assert.equal(
    sourceLink("https://example.com").external,
    "https://example.com",
  );
});

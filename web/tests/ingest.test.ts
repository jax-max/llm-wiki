import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { diffLines, formatDiff } from "../server/ingest-diff.js";
import { loadConfig, publicConfig } from "../server/config.js";
import {
  createStaging,
  cleanupStaging,
  digestTree,
  scanSources,
  collectChanges,
  applyChanges,
  verifyStaging,
} from "../server/ingest-staging.js";
const baseEnv = {
  LLM_API_KEY: "test-secret",
  LLM_MODEL: "test-model",
  LLM_BASE_URL: "http://127.0.0.1:9",
};
async function makeWiki() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ingest-test-"));
  await mkdir(path.join(root, "wiki/domains/d"), { recursive: true });
  await mkdir(path.join(root, "raw/src"), { recursive: true });
  await writeFile(path.join(root, "wiki/schema.md"), "# Schema");
  await writeFile(path.join(root, "wiki/index.md"), "# Index");
  await writeFile(path.join(root, "wiki/log.md"), "# Ingest Log\n");
  await writeFile(path.join(root, "wiki/domains/d/page.md"), "# Page\nold");
  await writeFile(
    path.join(root, "raw/src/a.md"),
    "# A\n\n> Source: https://example.com/post\n> Collected: 2026-10-01\n\nbody\n",
  );
  return root;
}
test("diffLines reports identical files without hunks", () => {
  const same = "a\nb\nc\n";
  const result = diffLines(same, same);
  assert.deepEqual(result, { hunks: [], additions: 0, deletions: 0 });
  assert.equal(formatDiff("wiki/x.md", result.hunks), "");
});
test("diffLines marks insertion, deletion and modification", () => {
  const insert = diffLines("a\nb\nc", "a\nb\nnew\nc");
  assert.equal(insert.additions, 1);
  assert.equal(insert.deletions, 0);
  assert.deepEqual(
    insert.hunks[0].lines.map((l) => l.type + l.text),
    [" a", " b", "+new", " c"],
  );
  assert.equal(insert.hunks[0].oldStart, 1);
  assert.equal(insert.hunks[0].newStart, 1);
  const del = diffLines("a\nb\nc", "a\nc");
  assert.equal(del.deletions, 1);
  assert.equal(del.additions, 0);
  assert.deepEqual(
    del.hunks[0].lines.map((l) => l.type),
    [" ", "-", " "],
  );
  const edit = diffLines("one\ntwo\nthree", "one\nTWO\nthree");
  assert.equal(edit.additions, 1);
  assert.equal(edit.deletions, 1);
});
test("diffLines splits distant changes and merges close ones", () => {
  const old = Array.from({ length: 40 }, (_, i) => `line-${i}`).join("\n");
  const far = old.replace("line-2", "X").replace("line-37", "Y");
  assert.equal(diffLines(old, far).hunks.length, 2);
  const near = old.replace("line-2", "X").replace("line-8", "Y");
  assert.equal(diffLines(old, near).hunks.length, 1);
});
test("diffLines anchors pure insertions at zero and survives large inputs", () => {
  const added = diffLines("", "fresh\ncontent\n");
  assert.deepEqual(
    added.hunks[0].lines.map((l) => l.type + l.text),
    ["+fresh", "+content", " "],
  );
  assert.equal(added.additions, 2);
  const removed = diffLines("gone\nnow\n", "");
  assert.equal(removed.deletions, 2);
  assert.equal(removed.additions, 0);
  const hugeOld = Array.from({ length: 2500 }, (_, i) => `o${i}`).join("\n");
  const hugeNew = Array.from({ length: 2500 }, (_, i) => `n${i}`).join("\n");
  const fallback = diffLines(hugeOld, hugeNew);
  assert.equal(fallback.additions, 2500);
  assert.equal(fallback.deletions, 2500);
});
test("formatDiff renders headers and truncates long output", () => {
  const old = Array.from({ length: 20 }, (_, i) => `row-${i}`).join("\n");
  const text = formatDiff(
    "wiki/log.md",
    diffLines(old, old + "\ntail").hunks,
    5,
  );
  assert.match(text, /^--- a\/wiki\/log\.md$/m);
  assert.match(text, /^\+\+\+ b\/wiki\/log\.md$/m);
  assert.match(text, /^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
  assert.match(text, /^\+tail$/m);
  const big = diffLines("", "x\n".repeat(500));
  const clipped = formatDiff("raw/a.md", big.hunks, 10);
  assert.ok(clipped.includes("… 以下 diff 已截断"));
  assert.ok(clipped.split("\n").length <= 14);
});
test("ingest configuration defaults, validation and availability", async () => {
  const c = await loadConfig(baseEnv);
  assert.equal(c.ingestEnabled, true);
  assert.equal(c.ingestAvailable, true);
  assert.equal(c.ingestMaxUploadMb, 2);
  assert.equal(c.ingestTimeoutMs, 1_200_000);
  assert.equal(c.ingestMaxTurns, 80);
  assert.equal(c.ingestValidate, "auto");
  const disabled = await loadConfig({ ...baseEnv, INGEST_ENABLED: "false" });
  assert.equal(disabled.ingestEnabled, false);
  assert.equal(disabled.ingestAvailable, false);
  const openai = await loadConfig({
    ...baseEnv,
    LLM_API: "openai-completions",
    LLM_BASE_URL: "http://127.0.0.1:9/v1",
  });
  assert.equal(openai.ingestEnabled, true);
  assert.equal(openai.ingestAvailable, false);
  await assert.rejects(
    loadConfig({ ...baseEnv, INGEST_VALIDATE: "x" }),
    /INGEST_VALIDATE/,
  );
  await assert.rejects(
    loadConfig({ ...baseEnv, INGEST_MAX_UPLOAD_MB: "99" }),
    /INGEST_MAX_UPLOAD_MB/,
  );
  await assert.rejects(
    loadConfig({ ...baseEnv, INGEST_ENABLED: "maybe" }),
    /INGEST_ENABLED/,
  );
  assert.deepEqual(publicConfig(c).ingest, { available: true, maxUploadMb: 2 });
});
test("staging copy matches the source tree and cleanup removes it", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    assert.deepEqual(await digestTree(staging), await digestTree(root));
    await cleanupStaging(staging);
    await assert.rejects(stat(staging));
    const sources = await scanSources(root);
    assert.equal(
      sources.byUrl.get("https://example.com/post")?.rawPath,
      "raw/src/a.md",
    );
    assert.equal(
      sources.byUrl.get("https://example.com/post")?.collected,
      "2026-10-01",
    );
    assert.ok([...sources.byBodySha.values()].includes("raw/src/a.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("collectChanges classifies added, modified, deleted and outside files", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    await writeFile(
      path.join(staging, "wiki/domains/d/page.md"),
      "# Page\nnew body",
    );
    await mkdir(path.join(staging, "wiki/domains/d/entities"), {
      recursive: true,
    });
    await writeFile(path.join(staging, "wiki/domains/d/entities/e.md"), "# E");
    await writeFile(
      path.join(staging, "raw/src/b.md"),
      "# B\n\n> Source: https://example.com/b\n> Collected: 2026-10-02\n\nb\n",
    );
    await rm(path.join(staging, "raw/src/a.md"));
    await writeFile(path.join(staging, "notes.txt"), "outside");
    const { changes, deleted, outside } = await collectChanges(root, staging);
    assert.deepEqual(
      changes.map((c) => [c.path, c.change]),
      [
        ["raw/src/b.md", "added"],
        ["wiki/domains/d/entities/e.md", "added"],
        ["wiki/domains/d/page.md", "modified"],
      ],
    );
    const page = changes.find((c) => c.path === "wiki/domains/d/page.md")!;
    assert.equal(page.additions, 1);
    assert.equal(page.deletions, 1);
    assert.match(page.diff, /^-old$/m);
    assert.deepEqual(deleted, ["raw/src/a.md"]);
    assert.deepEqual(outside, ["notes.txt"]);
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("verifyStaging rewrites wrong digests and flags unreferenced raw files", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    const rawBody =
      "# B\n\n> Source: https://example.com/b\n> Collected: 2026-10-02\n\nb\n";
    await writeFile(path.join(staging, "raw/src/b.md"), rawBody);
    await writeFile(path.join(staging, "raw/src/c.md"), "# C\n");
    const { createHash } = await import("node:crypto");
    const realSha = createHash("sha256").update(rawBody).digest("hex");
    await writeFile(
      path.join(staging, "wiki/log.md"),
      [
        "# Ingest Log",
        "",
        "## [2026-10-02] ingest | B",
        "- Disposition: New",
        "- Raw: raw/src/b.md",
        "- SHA-256: dead" + "0".repeat(60),
        "",
      ].join("\n"),
    );
    const { fixed, problems } = await verifyStaging(staging, root);
    assert.deepEqual(fixed, ["raw/src/b.md"]);
    assert.deepEqual(problems, [
      "新增 raw 未被 wiki/log.md 任何摄入条目引用：raw/src/c.md",
    ]);
    const log = await (
      await import("node:fs/promises")
    ).readFile(path.join(staging, "wiki/log.md"), "utf8");
    assert.ok(log.includes(`- SHA-256: ${realSha}`));
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("verifyStaging accepts no-material entries as references", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    await writeFile(path.join(staging, "raw/src/n.md"), "# N\n");
    await writeFile(
      path.join(staging, "wiki/log.md"),
      [
        "# Ingest Log",
        "",
        "## [2026-10-02] ingest | no material: raw/src/n.md",
        "- Disposition: No material",
      ].join("\n"),
    );
    const { fixed, problems } = await verifyStaging(staging, root);
    assert.deepEqual(fixed, []);
    assert.deepEqual(problems, []);
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("applyChanges copies additions and edits, refuses conflicts, never deletes", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    const baseline = await digestTree(root);
    await writeFile(
      path.join(staging, "wiki/domains/d/page.md"),
      "# Page\nnew body",
    );
    await mkdir(path.join(staging, "wiki/domains/d/entities"), {
      recursive: true,
    });
    await writeFile(path.join(staging, "wiki/domains/d/entities/e.md"), "# E");
    const { changes } = await collectChanges(root, staging);
    const applied = await applyChanges(root, staging, changes, baseline);
    assert.deepEqual(applied.sort(), [
      "wiki/domains/d/entities/e.md",
      "wiki/domains/d/page.md",
    ]);
    assert.match(
      await (
        await import("node:fs/promises")
      ).readFile(path.join(root, "wiki/domains/d/page.md"), "utf8"),
      /new body/,
    );
    // Stale baseline: an external edit between preview and apply must 409.
    const staging2 = await createStaging(root);
    const baseline2 = await digestTree(root);
    await writeFile(
      path.join(staging2, "wiki/domains/d/page.md"),
      "# Page\nconflicting",
    );
    const { changes: changes2 } = await collectChanges(root, staging2);
    await writeFile(
      path.join(root, "wiki/domains/d/page.md"),
      "# Page\nmoved on",
    );
    await assert.rejects(
      applyChanges(root, staging2, changes2, baseline2),
      (e: unknown) => (e as { code?: string }).code === "conflict",
    );
    await cleanupStaging(staging2);
    // Rejected paths must never point outside wiki/ or raw/.
    await assert.rejects(
      applyChanges(
        root,
        staging2,
        [
          {
            path: "../outside.md",
            change: "added",
            additions: 1,
            deletions: 0,
            diff: "",
          },
        ],
        baseline2,
      ),
      /越界/,
    );
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("validateUrl accepts http(s) and rejects bad input", async () => {
  const { validateUrl } = await import("../server/ingest-upload.js");
  assert.equal(
    validateUrl(" https://example.com/post "),
    "https://example.com/post",
  );
  assert.throws(() => validateUrl(undefined), /缺少来源 URL/);
  assert.throws(() => validateUrl("ftp://example.com"), /http\(s\)/);
  assert.throws(() => validateUrl("not a url"), /URL 无效/);
  assert.throws(
    () => validateUrl("https://user:pass@example.com"),
    /用户名或密码/,
  );
  assert.throws(() => validateUrl("https://x.com/" + "a".repeat(2000)), /过长/);
});
test("rawPathForUpload slugifies and de-duplicates same-day collisions", async () => {
  const { rawPathForUpload } = await import("../server/ingest-upload.js");
  const taken = new Set<string>(["raw/uploads/2026-10-15-notes.md"]);
  const first = await rawPathForUpload("Notes.md", "2026-10-15", (p) =>
    taken.has(p),
  );
  assert.equal(first, "raw/uploads/2026-10-15-notes-2.md");
  taken.add(first);
  const second = await rawPathForUpload("notes.md", "2026-10-15", (p) =>
    taken.has(p),
  );
  assert.equal(second, "raw/uploads/2026-10-15-notes-3.md");
  const weird = await rawPathForUpload(
    "我的 文档: v2?.txt",
    "2026-10-15",
    () => false,
  );
  assert.equal(weird, "raw/uploads/2026-10-15-我的-文档-v2.md");
});
test("readIngestInput handles JSON url and multipart file bodies", async () => {
  const { readIngestInput } = await import("../server/ingest-upload.js");
  const c = { wikiId: "default", ingestMaxUploadMb: 2 } as never;
  const checkWiki = (id: unknown) => {
    if (id !== "default") throw new Error("wiki mismatch");
  };
  const json = await readIngestInput(
    {
      headers: { "content-type": "application/json" },
      body: { wikiId: "default", url: "https://example.com/p" },
    },
    c,
    checkWiki,
  );
  assert.deepEqual(json, { kind: "url", url: "https://example.com/p" });
  const boundary = "----wikiboundary";
  const multipart = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="wikiId"',
      "",
      "default",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="note.md"',
      "Content-Type: text/markdown",
      "",
      "# 标题\n\n正文",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  const file = await readIngestInput(
    {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipart,
    },
    c,
    checkWiki,
  );
  assert.equal(file.kind, "file");
  assert.equal(file.filename, "note.md");
  // Filenames with escaped quotes are rejected by undici's multipart header
  // parser itself — the sanitiser in readIngestInput is defence in depth.
  await assert.rejects(
    readIngestInput(
      {
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.from(
          [
            `--${boundary}`,
            'Content-Disposition: form-data; name="wikiId"',
            "",
            "default",
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="my \\"notes\\".md"',
            "",
            "# 标题",
            `--${boundary}--`,
            "",
          ].join("\r\n"),
        ),
      },
      c,
      checkWiki,
    ),
    /解析失败|仅支持/,
  );
  assert.match((file as { text: string }).text, /标题/);
  await assert.rejects(
    readIngestInput(
      {
        headers: { "content-type": "application/json" },
        body: { wikiId: "default" },
      },
      c,
      checkWiki,
    ),
    /缺少来源 URL/,
  );
  const pdfBody = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="wikiId"',
      "",
      "default",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="a.pdf"',
      "",
      "%PDF",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  await assert.rejects(
    readIngestInput(
      {
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body: pdfBody,
      },
      c,
      checkWiki,
    ),
    /\.md/,
  );
});
test("IngestStore takes a job from running to preview and apply", async () => {
  const { IngestStore } = await import("../server/ingest.js");
  const { createHash } = await import("node:crypto");
  const raw = "raw/src/new.md";
  const content =
    "# New\n\n> Source: https://example.com/new\n> Collected: 2026-10-15\n\nnew body\n";
  const agent = async function* (input: { cwd: string }) {
    yield { type: "tool_use", name: "Grep", input: { pattern: "活动" } };
    await mkdir(path.dirname(path.join(input.cwd, raw)), { recursive: true });
    await writeFile(path.join(input.cwd, raw), content);
    const log = await (
      await import("node:fs/promises")
    ).readFile(path.join(input.cwd, "wiki/log.md"), "utf8");
    await writeFile(
      path.join(input.cwd, "wiki/log.md"),
      `${log}\n## [2026-10-15] ingest | New\n- Disposition: New\n- Raw: ${raw}\n- SHA-256: ${createHash("sha256").update(content).digest("hex")}\n`,
    );
    yield { type: "text", text: "已摄入" };
    yield { type: "result", subtype: "success", text: "Disposition: New" };
  };
  const root = await makeWiki();
  try {
    const base = await loadConfig(baseEnv);
    const c = { ...base, root, ingestValidate: "off" as const };
    const seen: { event: string; data: unknown }[] = [];
    const store = new IngestStore(c, agent as never);
    const job = await store.start({
      kind: "url",
      url: "https://example.com/new",
    });
    const unsubscribe = store.subscribe(job.id, (event, data) =>
      seen.push({ event, data }),
    );
    const waitFor = async (check: () => boolean) => {
      for (let i = 0; i < 500 && !check(); i++)
        await new Promise((r) => setTimeout(r, 10));
      assert.ok(check(), "waitFor timeout");
    };
    await waitFor(() => store.get(job.id)!.status === "preview");
    const preview = store.previewData(store.get(job.id)!);
    assert.deepEqual(
      preview.changes!.map((ch) => [ch.path, ch.change]).sort(),
      [
        ["raw/src/new.md", "added"],
        ["wiki/log.md", "modified"],
      ],
    );
    const applied = await store.apply(job.id);
    assert.deepEqual(applied.sort(), ["raw/src/new.md", "wiki/log.md"]);
    assert.equal(store.get(job.id)!.status, "applied");
    assert.match(
      await (
        await import("node:fs/promises")
      ).readFile(path.join(root, raw), "utf8"),
      /new body/,
    );
    const names = seen.map((s) => s.event);
    assert.equal(names[0], "status");
    assert.ok(names.includes("progress"));
    assert.ok(names.includes("delta"));
    assert.equal(names.at(-2), "done");
    assert.equal(names.at(-1), "status");
    unsubscribe();
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("IngestStore enforces single-flight, duplicates, cancel and disabled", async () => {
  const { IngestStore } = await import("../server/ingest.js");
  const root = await makeWiki();
  try {
    const base = await loadConfig(baseEnv);
    const c = { ...base, root, ingestValidate: "off" as const };
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const gated = async function* () {
      await gate;
      yield { type: "result", subtype: "success", text: "ok" };
    };
    const store = new IngestStore(c, gated as never);
    const first = await store.start({
      kind: "url",
      url: "https://example.com/one",
    });
    await assert.rejects(
      store.start({ kind: "url", url: "https://example.com/two" }),
      (e: unknown) => (e as { code?: string }).code === "busy",
    );
    release();
    for (let i = 0; i < 500 && store.get(first.id)!.status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(store.get(first.id)!.status, "preview");
    store.close();
    // Identical body content is rejected as a duplicate.
    const store2 = new IngestStore(c, gated as never);
    await assert.rejects(
      store2.start({ kind: "file", filename: "copy.md", text: "body\n" }),
      (e: unknown) => (e as { code?: string }).code === "duplicate",
    );
    store2.close();
    // Cancelling a running job aborts the agent and cleans staging.
    const store3 = new IngestStore(c, gated as never);
    const job3 = await store3.start({
      kind: "url",
      url: "https://example.com/three",
    });
    assert.ok(store3.cancel(job3.id));
    for (let i = 0; i < 500 && store3.get(job3.id)!.status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(store3.get(job3.id)!.status, "cancelled");
    store3.close();
    // Disabled config rejects up front.
    const store4 = new IngestStore(
      { ...c, ingestAvailable: false },
      gated as never,
    );
    await assert.rejects(
      store4.start({ kind: "url", url: "https://example.com/x" }),
      (e: unknown) => (e as { code?: string }).code === "ingest_disabled",
    );
    store4.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("ingest HTTP API serves start, preview, apply and cancel", async () => {
  const { createApp } = await import("../server/app.js");
  const { createHash } = await import("node:crypto");
  const { readdir: testReaddir } = await import("node:fs/promises");
  const agent = async function* (input: { cwd: string }) {
    yield {
      type: "tool_use",
      name: "Read",
      input: { file_path: "wiki/index.md" },
    };
    await writeFile(
      path.join(input.cwd, "wiki/index.md"),
      "# Knowledge Base Index\n\n- extra entry\n",
    );
    // For upload jobs the server pre-writes raw/uploads/*.md; log each one
    // with its real digest so verification passes.
    const uploads = path.join(input.cwd, "raw/uploads");
    for (const name of await testReaddir(uploads).catch(() => [])) {
      const body = await (
        await import("node:fs/promises")
      ).readFile(path.join(uploads, name));
      const log = await (
        await import("node:fs/promises")
      ).readFile(path.join(input.cwd, "wiki/log.md"), "utf8");
      await writeFile(
        path.join(input.cwd, "wiki/log.md"),
        `${log}\n## [2026-10-15] ingest | Upload\n- Disposition: New\n- Raw: raw/uploads/${name}\n- SHA-256: ${createHash("sha256").update(body).digest("hex")}\n`,
      );
    }
    yield { type: "result", subtype: "success", text: "Disposition: Update" };
  };
  const root = await makeWiki();
  const server = await (async () => {
    const base = await loadConfig(baseEnv);
    const { app, close } = createApp(
      { ...base, root, ingestValidate: "off" as const },
      undefined,
      agent as never,
    );
    const instance = app.listen(0, "127.0.0.1");
    await new Promise((r) => instance.once("listening", r));
    return { instance, close };
  })();
  try {
    const base = `http://127.0.0.1:${(server.instance.address() as import("node:net").AddressInfo).port}`;
    // fetch() cannot override the Host header (forbidden header name), and
    // the app whitelists Host against the configured port — use node:http.
    const hit = (
      p: string,
      init: {
        method?: string;
        json?: unknown;
        file?: { name: string; body: string };
      } = {},
    ) =>
      new Promise<{ status: number; body: () => Promise<any> }>(
        (resolve, reject) => {
          const boundary = "----wikiboundary";
          const headers: Record<string, string> = {
            host: "127.0.0.1:3002",
          };
          let body: string | undefined;
          if (init.json !== undefined) {
            body = JSON.stringify(init.json);
            headers["content-type"] = "application/json";
          } else if (init.file) {
            body = [
              `--${boundary}`,
              'Content-Disposition: form-data; name="wikiId"',
              "",
              "default",
              `--${boundary}`,
              `Content-Disposition: form-data; name="file"; filename="${init.file.name}"`,
              "Content-Type: text/markdown",
              "",
              init.file.body,
              `--${boundary}--`,
              "",
            ].join("\r\n");
            headers["content-type"] =
              `multipart/form-data; boundary=${boundary}`;
          }
          const req = http.request(
            base + p,
            { method: init.method || (body ? "POST" : "GET"), headers },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () =>
                resolve({
                  status: res.statusCode ?? 0,
                  body: async () => JSON.parse(data || "{}"),
                }),
              );
            },
          );
          req.on("error", reject);
          if (body) req.write(body);
          req.end();
        },
      );
    const post = await hit("/api/ingest", {
      json: { wikiId: "default", url: "https://example.com/doc" },
    });
    assert.equal(post.status, 202);
    const { jobId } = (await post.body()) as { jobId: string };
    assert.equal((await hit(`/api/ingest/nope/preview`)).status, 404);
    assert.equal(
      (await hit(`/api/ingest/nope/apply`, { method: "POST" })).status,
      404,
    );
    assert.equal(
      (await hit(`/api/ingest/nope`, { method: "DELETE" })).status,
      404,
    );
    for (let i = 0; i < 500; i++) {
      if ((await hit(`/api/ingest/${jobId}/preview`)).status === 200) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const preview = await hit(`/api/ingest/${jobId}/preview`);
    assert.equal(preview.status, 200);
    const data = (await preview.body()) as {
      changes: { path: string; change: string }[];
    };
    assert.deepEqual(
      data.changes.map((ch) => [ch.path, ch.change]),
      [["wiki/index.md", "modified"]],
    );
    const apply = await hit(`/api/ingest/${jobId}/apply`, { method: "POST" });
    assert.equal(apply.status, 200);
    assert.deepEqual((await apply.body()).applied, ["wiki/index.md"]);
    assert.equal(
      (await hit(`/api/ingest/${jobId}/apply`, { method: "POST" })).status,
      409,
    );
    const upload = await hit("/api/ingest", {
      file: { name: "upload.md", body: "# 标题\n\n正文段落\n" },
    });
    assert.equal(upload.status, 202);
    const uploaded = (await upload.body()) as { jobId: string };
    for (let i = 0; i < 500; i++) {
      const state = (
        await (await hit(`/api/ingest/${uploaded.jobId}/preview`)).body()
      )?.status;
      if (state === "preview" || state === "error") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(
      (await hit(`/api/ingest/${uploaded.jobId}`, { method: "DELETE" })).status,
      204,
    );
    assert.equal(
      (await hit("/api/ingest", { file: { name: "a.pdf", body: "x" } })).status,
      400,
    );
    assert.equal(
      (
        await hit("/api/ingest", {
          json: { wikiId: "other", url: "https://example.com/x" },
        })
      ).status,
      400,
    );
  } finally {
    server.close();
    server.instance.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("verifyStaging flags agents that modify existing raw files", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    await writeFile(
      path.join(staging, "raw/src/a.md"),
      "# A\n\n> Source: https://example.com/post\n> Collected: 2026-10-01\n\ntampered\n",
    );
    const { problems } = await verifyStaging(staging, root);
    assert.ok(
      problems.some((p) => p.includes("不可变") && p.includes("raw/src/a.md")),
    );
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("applyChanges validates the whole batch before writing anything", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    const baseline = await digestTree(root);
    await writeFile(
      path.join(staging, "wiki/domains/d/page.md"),
      "# Page\nnew",
    );
    await writeFile(path.join(staging, "wiki/newpage.md"), "# New page");
    const { changes } = await collectChanges(root, staging);
    assert.equal(changes.length, 2);
    // After preview, someone creates a file that collides with an addition
    // sorted after page.md — the conflict must abort the whole batch.
    await writeFile(path.join(root, "wiki/newpage.md"), "# External");
    await assert.rejects(
      applyChanges(root, staging, changes, baseline),
      (e: unknown) => (e as { code?: string }).code === "conflict",
    );
    // page.md sorts before the conflict and still must not be written.
    assert.match(
      await (
        await import("node:fs/promises")
      ).readFile(path.join(root, "wiki/domains/d/page.md"), "utf8"),
      /old/,
    );
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("digestTree ignores non-whitelisted files but flags them as not applied", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    await writeFile(path.join(staging, "wiki/domains/d/logo.png"), "binary");
    await writeFile(path.join(root, "raw/src/keep.png"), "existing asset");
    await writeFile(path.join(staging, "raw/src/keep.png"), "existing asset");
    const { changes, outside } = await collectChanges(root, staging);
    assert.ok(!changes.some((c) => c.path.endsWith(".png")));
    assert.deepEqual(changes, []);
    // New non-whitelisted files are surfaced; pre-existing assets are not.
    assert.deepEqual(outside, ["wiki/domains/d/logo.png"]);
    await cleanupStaging(staging);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("fence confines writes to the staging cwd and rejects chained Bash", async () => {
  const { fence } = await import("../server/ingest-sdk.js");
  const cwd = "/tmp/wiki-ingest-staging";
  const allow = (
    toolName: string,
    input: Record<string, unknown>,
    fetchHost?: string,
  ) => fence(toolName, input, cwd, fetchHost).behavior;
  assert.equal(allow("Write", { file_path: `${cwd}/raw/a.md` }), "allow");
  assert.equal(allow("Write", { file_path: "raw/a.md" }), "allow");
  assert.equal(allow("Write", { file_path: "/etc/passwd" }), "deny");
  assert.equal(allow("Edit", { file_path: `${cwd}/../outside.md` }), "deny");
  assert.equal(allow("Read", { file_path: "/etc/hosts" }), "allow");
  assert.equal(allow("Bash", { command: "shasum -a 256 raw/a.md" }), "allow");
  assert.equal(allow("Bash", { command: "ls" }), "deny");
  assert.equal(allow("Bash", { command: "shasum -a 256 a; rm -rf /" }), "deny");
  assert.equal(allow("Bash", { command: "shasum a && echo pwned" }), "deny");
  assert.equal(
    allow("WebFetch", { url: "https://example.com/x" }, "example.com"),
    "allow",
  );
  assert.equal(
    allow("WebFetch", { url: "https://evil.com/x" }, "example.com"),
    "deny",
  );
  assert.equal(allow("WebFetch", { url: "https://example.com/x" }), "deny");
  assert.equal(allow("Task", { prompt: "anything" }), "deny");
});
test("external edits during the run are excluded from the preview diff", async () => {
  const root = await makeWiki();
  try {
    const staging = await createStaging(root);
    const baseline = await digestTree(root);
    // The agent edits a page…
    await writeFile(
      path.join(staging, "wiki/domains/d/page.md"),
      "# Page\nagent edit",
    );
    // …while an external editor touches a different file in the real library.
    await writeFile(path.join(root, "wiki/log.md"), "# Ingest Log\nEXTERNAL\n");
    const { changes, drifted } = await collectChanges(root, staging, baseline);
    assert.deepEqual(drifted, []);
    assert.deepEqual(
      changes.map((c) => c.path),
      ["wiki/domains/d/page.md"],
    );
    // External edit to the very file the agent changed: drifted, not a
    // mixed reversing diff.
    await writeFile(path.join(root, "wiki/domains/d/page.md"), "# Page\next");
    const second = await collectChanges(root, staging, baseline);
    assert.deepEqual(second.drifted, ["wiki/domains/d/page.md"]);
    assert.deepEqual(second.changes, []);
    // verifyStaging with the same baseline does not flag the immutable-raw
    // rule for externally edited raw files.
    const staging2 = await createStaging(root);
    await writeFile(path.join(root, "raw/src/a.md"), "# A\n\nbody changed\n");
    const verify = await verifyStaging(staging2, root, baseline);
    assert.deepEqual(verify.problems, []);
    await cleanupStaging(staging);
    await cleanupStaging(staging2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("readIngestInput tolerates uppercase Content-Type variants", async () => {
  const { readIngestInput } = await import("../server/ingest-upload.js");
  const boundary = "----wikiboundary";
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="wikiId"',
      "",
      "default",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="up.md"',
      "",
      "# 内容",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
  const input = await readIngestInput(
    {
      headers: {
        "content-type": `MULTIPART/FORM-DATA; boundary=${boundary}`,
      },
      body,
    },
    {} as never,
    () => {},
  );
  assert.equal(input.kind, "file");
});

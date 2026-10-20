import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DOCUMENT_LIMITS, parseDocument } from "../server/ingest-document.js";
import {
  readIngestInput,
  rawContentForUpload,
  rawPathForUpload,
} from "../server/ingest-upload.js";
import { MAX_DOCUMENT_BYTES } from "../server/wiki.js";
import { loadConfig } from "../server/config.js";
import { IngestStore } from "../server/ingest.js";
import { digestTree } from "../server/ingest-staging.js";
import { docx, pdf, pptx } from "./fixtures/ingest-documents.js";

const hasCode = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;

test("DOCX extracts Chinese headings, paragraphs and table cells deterministically", async () => {
  const bytes = docx();
  const text = await parseDocument("docx", bytes);
  assert.match(text, /# 资料标题/);
  assert.match(text, /中文正文/);
  assert.match(text, /[-*] 列表项目/);
  assert.match(text, /\|.*名称.*\|.*数量.*\|/);
  assert.match(text, /\|.*苹果.*\|.*3.*\|/);
  assert.equal(await parseDocument("docx", bytes), text);
});

test("PPTX preserves presentation order rather than slide filenames, and tables", async () => {
  const text = await parseDocument("pptx", pptx());
  assert.match(text, /## Slide 1/);
  assert.match(text, /## Slide 2/);
  assert.ok(text.indexOf("第一张") < text.indexOf("第二张"));
  assert.match(text, /\|.*表格内容.*\|/);
});

test("PDF extracts text by page and keeps page numbers", async () => {
  const bytes = pdf();
  const text = await parseDocument("pdf", bytes);
  assert.match(
    text,
    /## Page 1[\s\S]*First page[\s\S]*## Page 2[\s\S]*Second page/,
  );
  assert.equal(await parseDocument("pdf", bytes), text);
  const chinese = await readFile(
    new URL("./fixtures/chinese.pdf", import.meta.url),
  );
  assert.match(await parseDocument("pdf", chinese), /中文资料正文/);
});

test("empty pages/slides cannot pass as content because of generated headings", async () => {
  await assert.rejects(
    parseDocument("pdf", pdf([""])),
    hasCode("upload_empty"),
  );
  const scanned = await readFile(
    new URL("./fixtures/scanned.pdf", import.meta.url),
  );
  await assert.rejects(parseDocument("pdf", scanned), hasCode("upload_empty"));
  await assert.rejects(
    parseDocument("pptx", pptx(true)),
    hasCode("upload_empty"),
  );
});

test("encrypted PDF requires the user to remove its password", async () => {
  const bytes = await readFile(
    new URL("./fixtures/encrypted.pdf", import.meta.url),
  );
  await assert.rejects(
    parseDocument("pdf", bytes),
    hasCode("upload_encrypted"),
  );
});

test("rejects corrupt files, extension mismatch, text and ZIP resource limits", async () => {
  await assert.rejects(
    parseDocument("pdf", Buffer.from("%PDF")),
    hasCode("upload_corrupt"),
  );
  await assert.rejects(parseDocument("docx", pdf()), hasCode("upload_format"));
  await assert.rejects(
    parseDocument("docx", docx(), { ...DOCUMENT_LIMITS, maxTextChars: 5 }),
    hasCode("upload_limit"),
  );
  await assert.rejects(
    parseDocument("pdf", pdf(), { ...DOCUMENT_LIMITS, maxTextChars: 5 }),
    hasCode("upload_limit"),
  );
  await assert.rejects(
    parseDocument("docx", docx(), {
      ...DOCUMENT_LIMITS,
      maxUncompressedBytes: 100,
    }),
    hasCode("upload_limit"),
  );
});

test("timeout terminates the worker and releases the single-parser slot", async () => {
  const first = parseDocument("docx", docx(), {
    ...DOCUMENT_LIMITS,
    timeoutMs: 1,
  });
  await assert.rejects(parseDocument("docx", docx()), hasCode("busy"));
  await assert.rejects(first, hasCode("upload_timeout"));
  assert.match(await parseDocument("docx", docx()), /中文正文/);
});

test("shutdown aborts extraction and releases the worker slot", async () => {
  const controller = new AbortController();
  const pending = parseDocument(
    "docx",
    docx(),
    DOCUMENT_LIMITS,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, hasCode("cancelled"));
  await assert.rejects(
    parseDocument("docx", docx(), DOCUMENT_LIMITS, controller.signal),
    hasCode("cancelled"),
  );
  assert.match(await parseDocument("docx", docx()), /中文正文/);
});

test("multipart uploads accept uppercase extensions, preserve filenames and strip raw suffixes", async () => {
  const form = new FormData();
  form.set("wikiId", "test");
  form.set("file", new File([new Uint8Array(docx())], "中文材料.DOCX"));
  const request = new Request("http://ingest.local", {
    method: "POST",
    body: form,
  });
  const input = await readIngestInput(
    {
      headers: { "content-type": request.headers.get("content-type") },
      body: Buffer.from(await request.arrayBuffer()),
    },
    { ingestMaxUploadMb: 20 } as never,
    (id) => assert.equal(id, "test"),
  );
  assert.equal(input.kind, "file");
  if (input.kind !== "file") assert.fail("expected file");
  assert.equal(input.filename, "中文材料.DOCX");
  assert.match(input.text, /中文正文/);
  assert.equal(
    await rawPathForUpload(input.filename, "2026-10-20", () => false),
    "raw/uploads/2026-10-20-中文材料.md",
  );
});

test("unsupported legacy formats and oversized files are rejected before parsing", async () => {
  for (const [filename, size, code] of [
    ["old.doc", 10, "upload_format"],
    ["old.ppt", 10, "upload_format"],
    ["large.pdf", 1024 * 1024 + 1, "upload"],
  ] as const) {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(size)], filename));
    const request = new Request("http://ingest.local", {
      method: "POST",
      body: form,
    });
    await assert.rejects(
      readIngestInput(
        {
          headers: { "content-type": request.headers.get("content-type") },
          body: Buffer.from(await request.arrayBuffer()),
        },
        { ingestMaxUploadMb: 1 } as never,
        () => {},
      ),
      hasCode(code),
    );
  }
});

test("rejects uploads whose raw evidence would exceed the reader's 8 MB limit", async () => {
  const form = new FormData();
  form.set("file", new File(["x".repeat(8 * 1024 * 1024)], "large.txt"));
  const request = new Request("http://ingest.local", {
    method: "POST",
    body: form,
  });
  await assert.rejects(
    readIngestInput(
      {
        headers: { "content-type": request.headers.get("content-type") },
        body: Buffer.from(await request.arrayBuffer()),
      },
      { ingestMaxUploadMb: 20 } as never,
      () => {},
    ),
    hasCode("upload_limit"),
  );
});

test("raw evidence size validation counts UTF-8 headers and preserves the exact boundary", async () => {
  const filename = "边界.txt";
  const overhead = Buffer.byteLength(
    rawContentForUpload(filename, "", "2026-10-20"),
  );
  const available = MAX_DOCUMENT_BYTES - overhead;
  const text =
    "中".repeat(Math.floor(available / 3)) + "x".repeat(available % 3);
  const upload = async (body: string) => {
    const form = new FormData();
    form.set("file", new File([body], filename));
    const request = new Request("http://ingest.local", {
      method: "POST",
      body: form,
    });
    return readIngestInput(
      {
        headers: { "content-type": request.headers.get("content-type") },
        body: Buffer.from(await request.arrayBuffer()),
      },
      { ingestMaxUploadMb: 20 } as never,
      () => {},
    );
  };
  const input = await upload(text);
  assert.equal(input.kind, "file");
  if (input.kind !== "file") assert.fail("expected file");
  assert.equal(input.text, text);
  assert.equal(
    Buffer.byteLength(
      rawContentForUpload(input.filename, input.text, "2026-10-20"),
    ),
    MAX_DOCUMENT_BYTES,
  );
  await assert.rejects(upload(text + "中"), hasCode("upload_limit"));
});

test("both ingest engines preview, discard and apply extracted text without retaining binaries", async (t) => {
  t.mock.method(console, "info", () => {});
  const text = await parseDocument("docx", docx());
  for (const ingestEngine of ["claude", "codex"] as const) {
    const root = await mkdtemp(path.join(tmpdir(), "wiki-doc-test-"));
    await mkdir(path.join(root, "wiki"));
    await mkdir(path.join(root, "raw"));
    for (const name of ["index", "schema", "log"])
      await writeFile(path.join(root, `wiki/${name}.md`), `# ${name}\n`);
    const config = await loadConfig({
      LLM_API_KEY: "test",
      LLM_MODEL: "test",
      LLM_BASE_URL: "http://127.0.0.1:9",
    });
    const store = new IngestStore(
      { ...config, root, ingestEngine, ingestValidate: "off" },
      async function* ({ cwd }) {
        const uploads = await readdir(path.join(cwd, "raw/uploads"));
        const rawPath = `raw/uploads/${uploads[0]}`;
        const content = await readFile(path.join(cwd, rawPath));
        await writeFile(
          path.join(cwd, "wiki/log.md"),
          `# log\n\n## [2026-10-20] ingest | document\n- Disposition: New\n- Raw: ${rawPath}\n- SHA-256: ${createHash("sha256").update(content).digest("hex")}\n`,
        );
        yield { type: "result", subtype: "success", text: "Disposition: New" };
      },
    );
    const input = { kind: "file" as const, filename: "材料.DOCX", text };
    const preview = async () => {
      const job = await store.start(input);
      for (let i = 0; i < 500 && job.status === "running"; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(job.status, "preview", job.error?.message);
      const change = store
        .previewData(job)
        .changes!.find((c) => c.path.startsWith("raw/uploads/"))!;
      assert.ok(change.path.endsWith("-材料.md"));
      assert.match(change.diff, /uploaded file "材料.DOCX"/);
      assert.match(change.diff, /中文正文/);
      return job;
    };
    try {
      const before = await digestTree(root);
      const discarded = await preview();
      assert.deepEqual(await digestTree(root), before);
      assert.equal(store.cancel(discarded.id), true);
      assert.deepEqual(await digestTree(root), before);
      const applied = await preview();
      await store.apply(applied.id);
      const names = await readdir(path.join(root, "raw/uploads"));
      assert.equal(names.length, 1);
      assert.ok(names[0].endsWith(".md"));
      assert.match(
        await readFile(path.join(root, "raw/uploads", names[0]), "utf8"),
        /中文正文/,
      );
      await assert.rejects(store.start(input), hasCode("duplicate"));
      store.close();
      await assert.rejects(store.start(input), hasCode("ingest_disabled"));
      const closing = new IngestStore({ ...config, root }, async function* () {
        assert.fail("a stopped store must never start its agent");
      });
      const pending = closing.start(input);
      closing.close();
      await assert.rejects(pending, hasCode("ingest_disabled"));
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});

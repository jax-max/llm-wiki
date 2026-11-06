import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  readFile,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, publicConfig, webRoot } from "../server/config.js";
import { Wiki, documentPath } from "../server/wiki.js";
import { loadPorts } from "../server/ports.js";
import {
  loadQuerySkill,
  providerConfig,
  createPi,
  runQuery,
  type Factory,
  type Session,
  type History,
} from "../server/agent.js";
import type {
  AgentSession,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { config, env, fakeFactory } from "./helpers.js";
test("catalog lists actual readable documents and metadata without exposing content or following symlinks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-catalog-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "wiki-outside-"));
  try {
    await mkdir(path.join(root, "wiki/domains/demo/rules"), {
      recursive: true,
    });
    await mkdir(path.join(root, "raw/source"), { recursive: true });
    await writeFile(
      path.join(root, "wiki/index.md"),
      "# Index\nNo registered links",
    );
    await writeFile(
      path.join(root, "wiki/domains/demo/rules/new.md"),
      "# 新规则\n> Type: Rule\n\nprivate-body",
    );
    await writeFile(
      path.join(root, "wiki/domains/demo/rules/unknown.md"),
      "# 未知类型\n> Type: FutureType",
    );
    await writeFile(path.join(root, "raw/source/plain.txt"), "plain content");
    await writeFile(path.join(root, "raw/source/empty.md"), "");
    await writeFile(path.join(root, "raw/source/image.png"), "not a document");
    await writeFile(path.join(root, ".env"), "secret");
    await writeFile(path.join(outside, "outside.md"), "# 外部资料");
    await symlink(outside, path.join(root, "wiki/domains/escape"));
    await symlink(
      path.join(outside, "outside.md"),
      path.join(root, "raw/source/link.md"),
    );
    const wiki = new Wiki(root);
    const { pages } = await wiki.catalog();
    assert.equal(pages.length, 5);
    assert.deepEqual(
      pages.find((p) => p.title === "新规则"),
      { path: "wiki/domains/demo/rules/new.md", title: "新规则", type: "Rule" },
    );
    assert.equal(pages.find((p) => p.title === "未知类型")?.type, "FutureType");
    assert.ok(pages.some((p) => p.title === "plain.txt"));
    assert.ok(pages.some((p) => p.title === "empty.md"));
    assert.ok(!JSON.stringify(pages).includes("private-body"));
    assert.ok(!JSON.stringify(pages).includes(root));
    assert.ok(!JSON.stringify(pages).includes("outside"));
    await writeFile(
      path.join(root, "wiki/domains/demo/rules/new.md"),
      "# 更新规则\n> Type: Rule",
    );
    assert.ok((await wiki.catalog()).pages.some((p) => p.title === "更新规则"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
test("catalog supports an empty knowledge base", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-empty-catalog-"));
  try {
    await mkdir(path.join(root, "wiki"));
    await mkdir(path.join(root, "raw"));
    assert.deepEqual(await new Wiki(root).catalog(), { pages: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("configuration validation, relative root and public secret isolation", async () => {
  assert.equal(config.root, path.resolve(webRoot, "../examples/demo-wiki"));
  assert.ok(!JSON.stringify(publicConfig(config)).includes("test-secret"));
  assert.equal(publicConfig(config).root, config.root);
  for (const key of ["LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL"])
    await assert.rejects(loadConfig({ ...env, [key]: "" }), new RegExp(key));
  await assert.rejects(loadConfig({ ...env, LLM_API: "invalid" }), /LLM_API/);
  await assert.rejects(loadConfig({ ...env, PORT: "oops" }), /PORT/);
  await assert.rejects(
    loadConfig({ ...env, WIKI_ROOT: "missing" }),
    /WIKI_ROOT/,
  );
  const budgetedTimeout = await loadConfig({
    ...env,
    QUERY_MAX_TOOL_CALLS: "10",
  });
  assert.equal(config.maxCalls, 30);
  assert.equal(config.timeout, 480000);
  assert.equal(budgetedTimeout.timeout, 180000);
  assert.equal(
    (
      await loadConfig({
        ...env,
        QUERY_MAX_TOOL_CALLS: "1000",
      })
    ).timeout,
    3600000,
  );
  assert.equal(
    (
      await loadConfig({
        ...env,
        QUERY_TIMEOUT_MS: "60000",
        QUERY_MAX_TOOL_CALLS: "1000",
      })
    ).timeout,
    60000,
  );
});
test("Chinese and alias search, prose pagination, real inbound/outbound edges and None inverse", async () => {
  const wiki = new Wiki(config.root);
  const view = await wiki.snapshot();
  assert.ok(view.search("活动准入").some((p) => p.type === "Rule"));
  assert.ok(view.search("checkLotteryCondition").length);
  assert.ok(view.search("用户 抽奖").length);
  assert.equal(view.search("not-in-wiki").length, 0);
  const rule = "wiki/domains/lottery-platform/rules/activity-admission.md";
  const flow = "wiki/domains/lottery-platform/workflows/user-participation.md";
  assert.ok(
    view
      .relations(rule)
      .some(
        (e) =>
          e.direction === "outgoing" &&
          e.verb === "governs" &&
          e.inverse === "governed-by",
      ),
  );
  assert.ok(
    view
      .relations(flow)
      .some((e) => e.direction === "incoming" && e.source === rule),
  );
  assert.ok(
    view
      .relations(flow)
      .some((e) => e.verb === "occurred-in" && e.inverse === null),
  );
  const first = await wiki.read(rule, 0, 20);
  const second = await wiki.read(rule, 20, 20);
  assert.equal(
    first.text + second.text,
    (await wiki.read(rule)).text.slice(0, 40),
  );
  assert.equal(
    documentPath(
      "../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md",
      rule,
    ),
    "raw/meituan-tech/2026-09-18-ddd-in-practice.md",
  );
});
test("path traversal, encoded attacks, symlink escapes, empty wiki and broken relations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-test-"));
  try {
    await mkdir(path.join(root, "wiki/domains"), { recursive: true });
    await mkdir(path.join(root, "raw"));
    await writeFile(path.join(root, "wiki/schema.md"), "# Schema");
    await writeFile(path.join(root, "wiki/index.md"), "# Index");
    const wiki = new Wiki(root);
    assert.equal((await wiki.snapshot()).pages.length, 0);
    for (const p of [
      "../private.md",
      "wiki/../../private.md",
      "wiki/%2e%2e/%2e%2e/private.md",
      "file:///etc/passwd",
      "wiki/a.png",
      "wiki/..\\x.md",
      "wiki/%00.md",
    ])
      await assert.rejects(wiki.read(p));
    await symlink("/etc/passwd", path.join(root, "wiki/escape.md"));
    await assert.rejects(wiki.read("wiki/escape.md"));
    await writeFile(
      path.join(root, "wiki/domains/中文.md"),
      "# 中文\n\n## Relations\n\n- governs: [Missing](missing.md)\n",
    );
    const view = await wiki.snapshot();
    assert.equal(view.relations("wiki/domains/中文.md")[0].broken, true);
    assert.equal((await wiki.read("wiki/domains/中文.md")).title, "中文");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("repository skill is loaded; missing skill fails; both protocol configurations", async () => {
  assert.match(await loadQuerySkill(), /Inverse is `None`/);
  await assert.rejects(loadQuerySkill("/missing/SKILL.md"), /Skill/);
  for (const api of ["anthropic-messages", "openai-completions"] as const) {
    const p = providerConfig({ ...config, api });
    assert.equal(p.api, api);
    assert.equal(p.baseUrl, env.LLM_BASE_URL);
    assert.equal(p.models[0].api, api);
  }
});
test("actual Pi runtime exposes only custom tools without external context", async () => {
  const tools = ["search_wiki", "read_document", "wiki_relations"].map(
    (name) => ({
      name,
      label: name,
      description: name,
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        details: {},
      }),
    }),
  );
  for (const api of ["anthropic-messages", "openai-completions"] as const) {
    const s = await createPi({ ...config, api }, "test isolation", tools, []);
    try {
      const actual = s as AgentSession;
      assert.deepEqual(
        actual.agent.state.tools.map((t) => t.name).sort(),
        tools.map((t) => t.name).sort(),
      );
      assert.equal(actual.messages.length, 0);
      assert.equal(actual.agent.state.model?.api, api);
      assert.ok(!actual.agent.state.systemPrompt.includes("AGENTS.md"));
    } finally {
      s.dispose();
    }
  }
});
test("query method, event order, completed history and context error", async () => {
  const events: string[] = [];
  const progressEvents: {
    tool?: string;
    path?: string;
    documentTitle?: string;
  }[] = [];
  const seen: History[] = [];
  const run = (history: History, message: string) =>
    runQuery(
      config,
      message,
      history,
      new AbortController(),
      (e, data) => {
        events.push(e);
        if (e === "progress")
          progressEvents.push(data as (typeof progressEvents)[number]);
      },
      fakeFactory({}, seen),
    );
  const history = await run([], "参与条件？");
  await run(history, "原始依据？");
  assert.equal(seen[1].length, 2);
  assert.equal(events[0], "progress");
  assert.ok(events.includes("delta"));
  assert.ok(
    progressEvents.some(
      (e) =>
        e.tool === "read_document" &&
        e.documentTitle === "活动准入" &&
        e.path?.endsWith("activity-admission.md"),
    ),
  );
  assert.ok(
    progressEvents
      .filter((e) => e.path === "wiki/schema.md" || e.path === "wiki/index.md")
      .every((e) => e.documentTitle === undefined),
  );
  await assert.rejects(
    runQuery(
      config,
      "问",
      [],
      new AbortController(),
      () => {},
      fakeFactory({ noTools: true }),
    ),
    /未完成 wiki-query.*缺失：schema、index、search.*已读：无/,
  );
  await assert.rejects(
    runQuery(
      config,
      "问",
      [],
      new AbortController(),
      () => {},
      fakeFactory({ error: "context window exceeded" }),
    ),
    /新建对话/,
  );
  await assert.rejects(
    runQuery(
      config,
      "问",
      [],
      new AbortController(),
      () => {},
      fakeFactory({ error: "boom 500" }),
    ),
    /模型调用失败.*stopReason=error：boom 500/,
  );
});
test("timeout, budget and cancellation do not return incomplete history", async () => {
  await assert.rejects(
    runQuery(
      { ...config, timeout: 15 },
      "问",
      [],
      new AbortController(),
      () => {},
      fakeFactory({ wait: true }),
    ),
    /超时/,
  );
  await assert.rejects(
    runQuery(
      { ...config, maxCalls: 1 },
      "问",
      [],
      new AbortController(),
      () => {},
      fakeFactory(),
    ),
    /次数/,
  );
  const c = new AbortController();
  const pending = runQuery(
    config,
    "问",
    [],
    c,
    () => {},
    fakeFactory({ wait: true }),
  );
  setTimeout(() => c.abort(new Error("cancel-test")), 15);
  await assert.rejects(pending, /cancel-test/);
});
test("demo query does not mutate files", async () => {
  const wiki = new Wiki(config.root);
  const before = await wiki.snapshot();
  const raw = await wiki.read(
    "raw/meituan-tech/2026-09-18-ddd-in-practice.md",
  );
  assert.match(raw.text, /领域驱动/);
  await runQuery(
    config,
    "活动有哪些状态？",
    [],
    new AbortController(),
    () => {},
    fakeFactory(),
  );
  assert.deepEqual((await wiki.snapshot()).pages, before.pages);
});

test("fixed port configuration validates both listeners and rejects conflicts", () => {
  assert.deepEqual(loadPorts({}), { port: 3002, webPort: 5174 });
  assert.deepEqual(loadPorts({ PORT: "3102", WEB_PORT: "5274" }), {
    port: 3102,
    webPort: 5274,
  });
  for (const key of ["PORT", "WEB_PORT"]) {
    for (const value of ["", "0", "65536", "1.5", "invalid"]) {
      assert.throws(() => loadPorts({ [key]: value }), new RegExp(key));
    }
  }
  assert.throws(
    () => loadPorts({ PORT: "3002", WEB_PORT: "3002" }),
    /不能使用相同端口/,
  );
});

// Core filesystem and switch coordination tests; no HTTP server or client.
test("directory selection validates roots, canonicalizes paths and lists only directories", async () => {
  const { browseDirectories, validateWikiRoot } = await import(
    "../server/workspace.js"
  );
  const { chmod } = await import("node:fs/promises");
  const base = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "wiki-select-")),
  );
  try {
    const root = path.join(base, "中文 Wiki");
    await mkdir(path.join(root, "wiki/domains"), { recursive: true });
    await mkdir(path.join(root, "raw"));
    await writeFile(path.join(root, "wiki/schema.md"), "# Schema");
    await writeFile(path.join(root, "wiki/index.md"), "# Index");
    await mkdir(path.join(base, ".hidden"));
    await writeFile(path.join(base, "secret.txt"), "must not be listed");
    await symlink(root, path.join(base, "alias"));
    assert.equal(await validateWikiRoot(path.join(base, "alias")), root);
    assert.deepEqual(
      (await browseDirectories(base)).directories.map((d) => d.name),
      ["中文 Wiki"],
    );
    assert.equal((await browseDirectories(base, true)).directories.length, 2);
    assert.equal((await browseDirectories(path.parse(base).root)).parent, null);
    await assert.rejects(validateWikiRoot(base), /wiki\/schema.md/);
    await assert.rejects(validateWikiRoot("relative"), /绝对/);
    await assert.rejects(
      browseDirectories(path.join(base, "missing")),
      /无法访问/,
    );
    await assert.rejects(
      browseDirectories(path.join(base, "secret.txt")),
      /无法访问/,
    );
    if (process.getuid?.() !== 0) {
      const denied = path.join(base, ".hidden");
      await chmod(denied, 0);
      try {
        await assert.rejects(browseDirectories(denied), /无法访问/);
      } finally {
        await chmod(denied, 0o700);
      }
    }
    await rm(path.join(root, "raw"), { recursive: true });
    await assert.rejects(validateWikiRoot(root), /raw/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("switching persists only valid roots, blocks concurrent work and preserves state on failure", async () => {
  const { WorkspaceSwitch, restoreWikiRoot, saveWikiRoot } = await import(
    "../server/workspace.js"
  );
  const base = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "wiki-state-")),
  );
  try {
    const root = path.join(base, "Selected Wiki");
    await mkdir(path.join(root, "wiki/domains"), { recursive: true });
    await mkdir(path.join(root, "raw"));
    await writeFile(path.join(root, "wiki/schema.md"), "# Schema");
    await writeFile(path.join(root, "wiki/index.md"), "# Index");
    const file = path.join(base, "state/selection.json");
    assert.equal(await restoreWikiRoot(file), undefined);
    const c = { ...config };
    let busy = true;
    let changes = 0;
    const selection = new WorkspaceSwitch(
      c,
      file,
      () => busy,
      () => changes++,
    );
    await assert.rejects(selection.select(root, c.wikiId), /先完成/);
    busy = false;
    const release = selection.acquire();
    await assert.rejects(selection.select(root, c.wikiId), /先完成/);
    release();
    release();
    const oldId = c.wikiId;
    const pending = selection.select(root, oldId);
    assert.throws(() => selection.acquire(), /切换/);
    await assert.rejects(selection.select(root, oldId), /先完成/);
    await pending;
    assert.equal(c.root, root);
    assert.equal(c.name, "Selected Wiki");
    assert.notEqual(c.wikiId, oldId);
    assert.equal(changes, 1);
    assert.equal(await restoreWikiRoot(file), root);
    await assert.rejects(selection.select(config.root, oldId), /刷新/);
    await selection.select(root, c.wikiId);
    assert.equal(changes, 1);
    await assert.rejects(selection.select(base, c.wikiId));
    assert.equal(c.root, root);
    await writeFile(file, "broken json");
    assert.equal(await restoreWikiRoot(file), undefined);
    await saveWikiRoot(file, path.join(base, "gone"));
    assert.equal(await restoreWikiRoot(file), undefined);
    const obstructed = path.join(base, "obstructed");
    await writeFile(obstructed, "file, not directory");
    const failing = new WorkspaceSwitch(
      c,
      path.join(obstructed, "selection.json"),
      () => false,
      () => changes++,
    );
    await assert.rejects(failing.select(config.root, c.wikiId), /无法保存/);
    assert.equal(c.root, root);
    assert.equal(changes, 1);
    const unlock = failing.acquire();
    unlock();
    const stopping = new WorkspaceSwitch(
      c,
      file,
      () => false,
      () => changes++,
    );
    const interrupted = stopping.select(config.root, c.wikiId);
    stopping.close();
    await assert.rejects(interrupted, /服务停止/);
    assert.throws(() => stopping.acquire(), /服务停止/);
    assert.equal(c.root, root);
    assert.equal(changes, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("reader and catalog preserve literal percent/hash filenames without decoding them twice", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-literal-paths-"));
  try {
    await mkdir(path.join(root, "raw"));
    for (const name of [
      "100%.md",
      "a#b.md",
      "literal%20space.md",
      "实际 space.md",
    ])
      await writeFile(path.join(root, "raw", name), `# ${name}\nbody`);
    const wiki = new Wiki(root);
    for (const name of ["100%.md", "a#b.md", "literal%20space.md"])
      assert.equal((await wiki.read(`raw/${name}`)).path, `raw/${name}`);
    assert.equal(
      (await wiki.read("raw/%E5%AE%9E%E9%99%85%20space.md#fragment")).path,
      "raw/实际 space.md",
    );
    assert.equal((await wiki.catalog()).pages.length, 4);
    await assert.rejects(wiki.read("raw/%2e%2e/%2e%2e/outside.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

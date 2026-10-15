import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  readFile,
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
test("configuration validation, relative root and public secret isolation", async () => {
  assert.equal(config.root, path.resolve(webRoot, "../examples/demo-wiki"));
  assert.ok(!JSON.stringify(publicConfig(config)).includes("test-secret"));
  assert.ok(!JSON.stringify(publicConfig(config)).includes(config.root));
  for (const key of ["LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL"])
    await assert.rejects(loadConfig({ ...env, [key]: "" }), new RegExp(key));
  await assert.rejects(loadConfig({ ...env, LLM_API: "invalid" }), /LLM_API/);
  await assert.rejects(loadConfig({ ...env, PORT: "oops" }), /PORT/);
  await assert.rejects(
    loadConfig({ ...env, WIKI_ROOT: "missing" }),
    /WIKI_ROOT/,
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
      "../../../../raw/demo-spec/2026-10-15-lottery-lifecycle.md",
      rule,
    ),
    "raw/demo-spec/2026-10-15-lottery-lifecycle.md",
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
    /未完成 wiki-query/,
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
test("demo source lifecycle is explicitly educational and query does not mutate files", async () => {
  const wiki = new Wiki(config.root);
  const before = await wiki.snapshot();
  const life = await wiki.read(
    "wiki/domains/lottery-platform/state-machines/lottery-activity.md",
  );
  assert.match(life.text, /教学/);
  const raw = await wiki.read("raw/demo-spec/2026-10-15-lottery-lifecycle.md");
  assert.match(raw.text, /教学/);
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

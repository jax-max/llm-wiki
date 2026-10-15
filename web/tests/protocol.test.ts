import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runQuery, type History } from "../server/agent.js";
import { Wiki } from "../server/wiki.js";
import { config, wikiDigest } from "./helpers.js";
type Step =
  | { name: string; args: Record<string, unknown> }
  | { answer: string };
const rule = "wiki/domains/lottery-platform/rules/activity-admission.md";
const flow = "wiki/domains/lottery-platform/workflows/user-participation.md";
const life = "wiki/domains/lottery-platform/state-machines/lottery-activity.md";
const raw = "raw/meituan-tech/2026-09-18-ddd-in-practice.md";
const lifecycleRaw = "raw/demo-spec/2026-10-15-lottery-lifecycle.md";
const read = (path: string): Step => ({
  name: "read_document",
  args: { path },
});
const search = (query: string): Step => ({
  name: "search_wiki",
  args: { query },
});
const relations = (path: string): Step => ({
  name: "wiki_relations",
  args: { path },
});
function writeStream(
  res: http.ServerResponse,
  api: string,
  step: Step,
  id: string,
) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (event: string, data: unknown) =>
    res.write(
      `${api === "anthropic-messages" ? "event: " + event + "\n" : ""}data: ${JSON.stringify(data)}\n\n`,
    );
  if (api === "anthropic-messages") {
    frame("message_start", {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        content: [],
        model: config.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });
    if ("name" in step) {
      frame("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tool_" + id,
          name: step.name,
          input: {},
        },
      });
      frame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify(step.args),
        },
      });
    } else {
      frame("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      });
      frame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: step.answer },
      });
    }
    frame("content_block_stop", { type: "content_block_stop", index: 0 });
    frame("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: "name" in step ? "tool_use" : "end_turn",
        stop_sequence: null,
      },
      usage: { output_tokens: 10 },
    });
    frame("message_stop", { type: "message_stop" });
  } else {
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      frame("", {
        id,
        object: "chat.completion.chunk",
        created: 1,
        model: config.model,
        choices: [{ index: 0, delta, finish_reason }],
      });
    chunk({ role: "assistant" });
    chunk(
      "name" in step
        ? {
            tool_calls: [
              {
                index: 0,
                id: "tool_" + id,
                type: "function",
                function: {
                  name: step.name,
                  arguments: JSON.stringify(step.args),
                },
              },
            ],
          }
        : { content: step.answer },
    );
    chunk({}, "name" in step ? "tool_calls" : "stop");
    res.write("data: [DONE]\n\n");
  }
  res.end();
}
for (const api of ["anthropic-messages", "openai-completions"] as const)
  test(`real Pi SDK ${api}: tool loop, citations, followups and demo evidence`, async () => {
    let steps: Step[] = [];
    const requests: { url: string; authorization: string; body: any }[] = [];
    let failure: Error | undefined;
    const server = http.createServer(async (req, res) => {
      try {
        let rawBody = "";
        for await (const chunk of req) rawBody += chunk;
        const body = JSON.parse(rawBody);
        requests.push({
          url: req.url!,
          authorization: String(
            req.headers["x-api-key"] || req.headers.authorization,
          ),
          body,
        });
        const next = steps.shift();
        if (!next) throw new Error("Unexpected model retry");
        writeStream(res, api, next, "msg_" + requests.length);
      } catch (e) {
        failure = e as Error;
        res.writeHead(500);
        res.end("{}");
      }
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const port = (server.address() as { port: number }).port;
    const c = {
      ...config,
      api,
      baseUrl: `http://127.0.0.1:${port}${api === "openai-completions" ? "/v1" : ""}`,
      timeout: 10000,
    };
    const traces: string[] = [];
    let history: History = [];
    const ask = async (question: string, actions: Step[], answer: string) => {
      steps = [
        read("wiki/schema.md"),
        read("wiki/index.md"),
        ...actions,
        { answer },
      ];
      let text = "";
      history = await runQuery(
        c,
        question,
        history,
        new AbortController(),
        (event, data) => {
          if (event === "delta") text += (data as { text: string }).text;
          if (event === "progress")
            traces.push((data as { tool: string }).tool);
        },
      );
      assert.equal(text, answer);
      assert.equal(steps.length, 0);
      if (failure) throw failure;
    };
    const wiki = new Wiki(c.root);
    const before = await wikiDigest(c.root);
    try {
      await ask(
        "用户参与抽奖需要满足什么条件？",
        [search("活动准入 参与频率"), read(rule), read(flow)],
        `活动准入检查包含时间与参与次数等条件。[活动准入](${rule}) [流程](${flow})`,
      );
      await ask(
        "这些规则约束哪些流程？",
        [search("活动准入"), read(rule), relations(rule), read(flow)],
        `活动准入通过 governs 关系约束用户参与抽奖流程。[流程](${flow})`,
      );
      await ask(
        "抽奖活动有哪些状态？",
        [search("生命周期"), read(life), read(lifecycleRaw)],
        `生命周期来自教学补充来源，不能当作原技术文章中的业务事实。[教学生命周期](${life})`,
      );
      await ask(
        "这个结论的原始依据是什么？",
        [search("生命周期"), read(life), read(lifecycleRaw)],
        `上轮结论的原始依据是教学补充文档。[原始依据](${lifecycleRaw})`,
      );
      await ask(
        "活动预算是多少？",
        [search("活动预算")],
        "知识库没有记录活动预算，无法给出有证据支持的金额。",
      );
      assert.ok(traces.includes("wiki_relations"));
      assert.ok(requests.at(-1)!.body.messages.length > 5);
      for (const request of requests) {
        assert.equal(
          new URL(request.url, "http://localhost").pathname,
          api === "anthropic-messages"
            ? "/v1/messages"
            : "/v1/chat/completions",
        );
        assert.ok(request.authorization.endsWith(config.apiKey));
        assert.equal(request.body.model, c.model);
        assert.match(JSON.stringify(request.body), /Query the Wiki/);
        const names = request.body.tools
          .map((t: any) => t.name || t.function?.name)
          .sort();
        assert.deepEqual(names, [
          "read_document",
          "search_wiki",
          "wiki_relations",
        ]);
      }
      assert.equal(await wikiDigest(c.root), before);
      assert.match((await wiki.read(raw)).text, /领域驱动/);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

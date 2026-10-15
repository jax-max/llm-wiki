// Explicit opt-in: this sends demo questions and wiki evidence to the configured model.
import assert from "node:assert/strict";
import { loadConfig } from "../server/config.js";
import { runQuery, type History } from "../server/agent.js";
import { wikiDigest } from "../tests/helpers.js";
const c = await loadConfig();
const before = await wikiDigest(c.root);
let history: History = [];
for (const question of [
  "用户参与抽奖需要满足什么条件？",
  "这些规则约束哪些流程？",
  "抽奖活动有哪些状态？",
  "这个结论的原始依据是什么？",
  "活动预算是多少？",
]) {
  const traces: { tool: string; path?: string }[] = [];
  let answer = "";
  history = await runQuery(
    c,
    question,
    history,
    new AbortController(),
    (event, data) => {
      if (event === "delta") answer += (data as { text: string }).text;
      if (event === "progress")
        traces.push(data as { tool: string; path?: string });
    },
  );
  assert.ok(answer.trim(), "No answer");
  assert.ok(traces.some((t) => t.tool === "search_wiki"));
  if (question.includes("哪些流程"))
    assert.ok(
      traces.some((t) => t.tool === "wiki_relations"),
      "Relationship question did not traverse relations",
    );
  if (question.includes("原始依据"))
    assert.ok(
      traces.some(
        (t) => t.tool === "read_document" && t.path?.startsWith("raw/"),
      ),
      "Raw was not read",
    );
  console.info(
    JSON.stringify({ question, tools: traces.map((t) => t.tool), answer }),
  );
}
assert.equal(
  await wikiDigest(c.root),
  before,
  "Wiki/raw changed during read-only query",
);
console.info(
  "Live smoke complete. Review answers and citations against the demo acceptance checklist.",
);

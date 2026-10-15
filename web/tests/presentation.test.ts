// Frontend checks: run by the user via npm run test:client.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progressMessage,
  errorMessage,
  sourceTitle,
} from "../src/presentation.js";
import { readSSE, ResponseError } from "../src/sse.js";

test("progress uses source titles and never backend labels or paths", () => {
  assert.equal(
    progressMessage({ tool: "read_document", documentTitle: "抽奖尝试计数" }),
    "正在阅读《抽奖尝试计数》",
  );
  assert.equal(progressMessage({ tool: "read_document" }), "正在核对资料…");
  assert.equal(
    progressMessage({ tool: "wiki_relations" }),
    "正在梳理相关信息…",
  );
  assert.equal(progressMessage({ tool: "search_wiki" }), "正在查找相关内容…");
  assert.equal(progressMessage({ tool: "unknown" }), "正在查找相关内容…");
  assert.equal(sourceTitle("wiki/domains/rules/a.md"), "");
  assert.equal(sourceTitle("a.md"), "");
  assert.equal(sourceTitle(undefined), "");
});

test("failures use actionable copy without exposing implementation details", async () => {
  const detail =
    "wiki/domains/private.md API LLM_API_KEY contextWindow tool budget";
  for (const code of [
    "budget",
    "context",
    "session",
    "busy",
    "provider",
    "skill",
    "timeout",
    "unknown",
  ]) {
    const message = errorMessage({ code, message: detail });
    assert.doesNotMatch(
      message,
      /wiki\/|API|contextWindow|budget|工具|配置|上下文/,
    );
  }
  assert.match(errorMessage({ code: "context" }), /新建对话/);
  assert.match(errorMessage({ code: "budget" }), /缩小问题范围/);
  assert.match(errorMessage(new Error(detail), "source"), /其他来源/);
  assert.match(errorMessage(new Error(detail)), /稍后重试/);
  await assert.rejects(
    readSSE(
      Response.json({ code: "session", error: detail }, { status: 404 }),
      () => {},
    ),
    (error) => error instanceof ResponseError && error.code === "session",
  );
});

// Explicit local fixture for manual UI checks. Never imported by the application.
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { config, fakeFactory } from "./helpers.js";
const answer =
  "用户参与抽奖需要通过活动准入检查，包括活动时间、用户参与次数等条件。随后还需通过参与频率风控。\n\n- [活动准入](wiki/domains/lottery-platform/rules/activity-admission.md)\n- [用户参与抽奖流程](wiki/domains/lottery-platform/workflows/user-participation.md)\n\n**证据缺口：**知识库没有给出所有活动统一适用的次数上限，应核对具体活动配置。";
// Ingest runs against a throwaway copy of demo-wiki so the fixture never
// touches the real example tree.
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "wiki-preview-"));
await cp(path.join(config.root, "wiki"), path.join(fixtureRoot, "wiki"), {
  recursive: true,
});
await cp(path.join(config.root, "raw"), path.join(fixtureRoot, "raw"), {
  recursive: true,
});
const ingestAgent = async function* (input: { cwd: string }) {
  yield {
    type: "tool_use",
    name: "WebFetch",
    input: { url: "https://example.com/spec" },
  };
  const rawRel = "raw/example-com/2026-10-15-demo-spec.md";
  const rawBody =
    "# Demo Spec\n\n> Source: https://example.com/spec\n> Collected: 2026-10-15\n\n演示摄入来源：虚拟抽奖活动需在活动时间内参与，且通过风控检查。\n";
  await mkdir(path.dirname(path.join(input.cwd, rawRel)), { recursive: true });
  await writeFile(path.join(input.cwd, rawRel), rawBody);
  const pageRel = "wiki/domains/lottery-platform/rules/fixture-rule.md";
  await writeFile(
    path.join(input.cwd, pageRel),
    "# Fixture 规则\n\n> Type: Rule\n> Raw: [demo spec](../../../../raw/example-com/2026-10-15-demo-spec.md)\n> Updated: 2026-10-15\n\n## Rule\n\n演示规则。\n\n## Relations\n\n- governs: [用户参与抽奖流程](../workflows/user-participation.md)\n",
  );
  // Upload jobs land in raw/uploads (written by the server); log them too.
  const entries: string[] = [];
  for (const name of await readdir(path.join(input.cwd, "raw/uploads")).catch(
    () => [],
  ))
    entries.push(`raw/uploads/${name}`);
  let log = await readFile(path.join(input.cwd, "wiki/log.md"), "utf8");
  for (const rel of [rawRel, ...entries]) {
    const bytes = await readFile(path.join(input.cwd, rel));
    log += `\n## [2026-10-15] ingest | Fixture\n- Disposition: New\n- Raw: ${rel}\n- SHA-256: ${createHash("sha256").update(bytes).digest("hex")}\n${rel === rawRel ? `- Pages: ${pageRel}\n` : ""}`;
  }
  await writeFile(path.join(input.cwd, "wiki/log.md"), log);
  yield { type: "text", text: "已保存 raw 证据并编译页面。" };
  yield {
    type: "result",
    subtype: "success",
    text: "Disposition: New；新增 fixture-rule 页面。",
  };
};
const { app, close } = createApp(
  { ...config, root: fixtureRoot, name: "demo-wiki · 本地测试替身" },
  fakeFactory({ answer, delay: 180 }),
  ingestAgent as never,
);
const server = app.listen(config.port, "127.0.0.1", () =>
  console.info(`UI fixture: http://127.0.0.1:${config.port}`),
);
const stop = () => {
  close();
  server.close();
  void rm(fixtureRoot, { recursive: true, force: true });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

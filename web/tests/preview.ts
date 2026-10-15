// Explicit local fixture for manual UI checks. Never imported by the application.
import { createApp } from "../server/app.js";
import { config, fakeFactory } from "./helpers.js";
const answer =
  "用户参与抽奖需要通过活动准入检查，包括活动时间、用户参与次数等条件。随后还需通过参与频率风控。\n\n- [活动准入](wiki/domains/lottery-platform/rules/activity-admission.md)\n- [用户参与抽奖流程](wiki/domains/lottery-platform/workflows/user-participation.md)\n\n**证据缺口：**知识库没有给出所有活动统一适用的次数上限，应核对具体活动配置。";
const { app, close } = createApp(
  { ...config, name: "demo-wiki · 本地测试替身" },
  fakeFactory({ answer, delay: 180 }),
);
const server = app.listen(config.port, "127.0.0.1", () =>
  console.info(`UI fixture: http://127.0.0.1:${config.port}`),
);
process.on("SIGTERM", () => {
  close();
  server.close();
});
process.on("SIGINT", () => {
  close();
  server.close();
});

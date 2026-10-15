import { loadConfig } from "./config.js";
import { loadQuerySkill } from "./agent.js";
import { Wiki } from "./wiki.js";
import { createApp } from "./app.js";
try {
  const config = await loadConfig();
  await loadQuerySkill();
  await new Wiki(config.root).snapshot();
  const { app, close } = createApp(config);
  const server = app.listen(config.port, "127.0.0.1", () =>
    console.info(`Wiki Web: http://127.0.0.1:${config.port}`),
  );
  server.once("error", (error: NodeJS.ErrnoException) => {
    close();
    console.error(
      error.code === "EADDRINUSE"
        ? `PORT=${config.port} 已被占用，请关闭占用程序或修改 web/.env；不会自动切换端口。`
        : "无法监听配置端口，请检查 web/.env 和本机权限。",
    );
    process.exitCode = 1;
  });
  const stop = () => {
    close();
    server.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(error instanceof Error ? error.message : "启动失败");
  process.exitCode = 1;
}

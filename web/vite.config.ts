import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import path from "node:path";
import { webRoot } from "./server/config";
import { loadPorts } from "./server/ports";

export default defineConfig(() => {
  // Match the backend: one .env file and the same port validation.
  const fileEnv = dotenv.config({ path: path.join(webRoot, ".env") }).parsed;
  const { port, webPort } = loadPorts({ ...process.env, ...fileEnv });
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${port}` },
    },
    preview: { host: "127.0.0.1", port: webPort, strictPort: true },
    build: { outDir: "dist/client" },
  };
});

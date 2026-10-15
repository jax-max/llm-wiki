export function loadPorts(env: NodeJS.ProcessEnv) {
  const integer = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${key} 必须是 1–65535 的整数`);
    }
    return value;
  };
  const port = integer("PORT", 3002);
  const webPort = integer("WEB_PORT", 5174);
  if (port === webPort) throw new Error("PORT 和 WEB_PORT 不能使用相同端口");
  return { port, webPort };
}

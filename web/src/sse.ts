export class ResponseError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function readSSE(
  response: Response,
  onEvent: (event: string, data: any) => void,
) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ResponseError(
      typeof body.code === "string" ? body.code : "request",
      body.error || "请求失败",
    );
  }
  if (!response.body)
    throw new ResponseError("unsupported", "浏览器不支持流式响应");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let at;
      while ((at = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const event = frame.match(/^event: (.+)$/m)?.[1];
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (event && data) {
          onEvent(event, JSON.parse(data));
          if (event === "done" || event === "error") terminal = true;
        }
      }
      if (done) break;
    }
    if (!terminal) throw new ResponseError("connection", "连接已中断，请重试");
  } finally {
    reader.releaseLock();
  }
}

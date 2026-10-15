// User-facing copy is deliberately independent of tool labels and error details.
export function sourceTitle(title: unknown): string {
  if (typeof title !== "string") return "";
  const value = title.trim();
  if (/^(?:wiki|raw)\//i.test(value) || /\.(?:md|txt)$/i.test(value)) return "";
  return value;
}

export function progressMessage(data: {
  tool?: string;
  documentTitle?: unknown;
}): string {
  if (data.tool === "read_document") {
    const title = sourceTitle(data.documentTitle);
    return title ? `正在阅读《${title}》` : "正在核对资料…";
  }
  if (data.tool === "wiki_relations") return "正在梳理相关信息…";
  return "正在查找相关内容…";
}

export function errorMessage(
  error: unknown,
  context: "chat" | "source" = "chat",
): string {
  if (context === "source") return "暂时无法打开这份资料，请试试其他来源。";
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  switch (code) {
    case "cancelled":
      return "已停止生成，可以重试或继续提问。";
    case "timeout":
      return "这次查找用时较长，请稍后重试。";
    case "budget":
      return "这次需要查阅的资料较多，请缩小问题范围后再试。";
    case "context":
      return "这段对话已经很长了，请新建对话后继续。";
    case "session":
      return "这段对话已结束，请新建对话后继续。";
    case "busy":
      return "正在回答上一个问题，请稍等片刻。";
    case "capacity":
      return "暂时无法开始新对话，请稍后再试。";
    case "message":
      return "请填写问题，并将长度控制在 16000 字以内。";
    case "connection":
      return "连接暂时中断，请稍后重试。";
    case "unsupported":
      return "当前浏览器暂时无法显示回答，请换一个浏览器重试。";
    default:
      return "暂时无法完成回答，请稍后重试。";
  }
}

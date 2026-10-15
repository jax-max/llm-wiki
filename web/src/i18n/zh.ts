import type { Copy } from "./types";

const zh: Copy = {
  appTitle: "Wiki 对话",
  header: {
    subtitle: "知识库问答",
    newChat: "＋ 新建对话",
  },
  language: {
    switch: "切换到英文",
  },
  welcome: {
    eyebrow: "YOUR KNOWLEDGE, CONNECTED",
    titleLines: ["从一个问题开始，", "找到有依据的答案。"],
    lead: "查找相关资料，并随时查看回答的依据。",
    suggestions: [
      "用户参与抽奖需要满足什么条件？",
      "这些规则约束哪些流程？",
      "抽奖活动有哪些状态？",
    ],
  },
  turn: {
    running: "查询中",
    done: "基于知识库",
    incomplete: "本轮未完成",
    retry: "重试本轮",
  },
  progress: {
    search: "正在查找相关内容…",
    readingTitle: (title) => `正在阅读《${title}》`,
    reading: "正在核对资料…",
    relations: "正在梳理相关信息…",
    streaming: "正在整理回答…",
    opening: "正在打开资料…",
  },
  composer: {
    askAria: "向知识库提问",
    placeholder: "向知识库提问，或继续追问…",
    retryPlaceholder: "可重试本轮，或继续提问…",
    disclaimer: "答案可能有误，请核对引用来源",
    send: "发送 ↑",
    stop: "■ 停止生成",
  },
  source: {
    panelLabel: "来源阅读",
    back: "← 返回",
    closeAria: "关闭来源",
    fallbackTitle: "参考资料",
    continueReading: "继续阅读",
    empty: "点击回答中的引用阅读来源。",
  },
  fatal: {
    connect: "暂时无法连接知识库，请稍后刷新页面。",
  },
  errors: {
    source: "暂时无法打开这份资料，请试试其他来源。",
    cancelled: "已停止生成，可以重试或继续提问。",
    timeout: "这次查找用时较长，请稍后重试。",
    budget: "这次需要查阅的资料较多，请缩小问题范围后再试。",
    context: "这段对话已经很长了，请新建对话后继续。",
    session: "这段对话已结束，请新建对话后继续。",
    busy: "正在回答上一个问题，请稍等片刻。",
    capacity: "暂时无法开始新对话，请稍后再试。",
    message: "请填写问题，并将长度控制在 16000 字以内。",
    connection: "连接暂时中断，请稍后重试。",
    unsupported: "当前浏览器暂时无法显示回答，请换一个浏览器重试。",
    fallback: "暂时无法完成回答，请稍后重试。",
  },
};

export default zh;

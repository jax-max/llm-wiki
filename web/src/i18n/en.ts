import type { Copy } from "./types";

const en: Copy = {
  appTitle: "Wiki Chat",
  header: {
    subtitle: "Knowledge base Q&A",
    newChat: "＋ New chat",
  },
  language: {
    switch: "Switch to Chinese",
  },
  welcome: {
    eyebrow: "YOUR KNOWLEDGE, CONNECTED",
    titleLines: [
      "Start with one question,",
      "find an answer backed by sources.",
    ],
    lead: "Search related documents and inspect the evidence behind each answer.",
    suggestions: [
      "What conditions must users meet to join the lottery?",
      "Which processes do these rules govern?",
      "What states can a lottery campaign be in?",
    ],
  },
  turn: {
    running: "Searching",
    done: "Based on the wiki",
    incomplete: "Turn incomplete",
    retry: "Retry turn",
  },
  progress: {
    search: "Searching the wiki…",
    readingTitle: (title) => `Reading "${title}"`,
    reading: "Checking sources…",
    relations: "Mapping related information…",
    streaming: "Composing the answer…",
    opening: "Opening document…",
  },
  composer: {
    askAria: "Ask the wiki",
    placeholder: "Ask the wiki a question, or follow up…",
    retryPlaceholder: "Retry this turn, or keep asking…",
    disclaimer: "Answers may be wrong — check the cited sources",
    send: "Send ↑",
    stop: "■ Stop",
  },
  source: {
    panelLabel: "Source reader",
    back: "← Back",
    closeAria: "Close source",
    fallbackTitle: "Reference",
    continueReading: "Continue reading",
    empty: "Click a citation in an answer to read its source.",
  },
  fatal: {
    connect: "Cannot reach the knowledge base right now. Please refresh later.",
  },
  errors: {
    source: "Cannot open this document right now. Try another source.",
    cancelled: "Generation stopped. You can retry or keep asking.",
    timeout: "This search is taking too long. Please try again later.",
    budget: "This question needs too many documents. Try narrowing it down.",
    context:
      "This conversation has grown too long. Start a new chat to continue.",
    session: "This conversation has ended. Start a new chat to continue.",
    busy: "Still answering the previous question. Please wait a moment.",
    capacity:
      "Cannot start a new conversation right now. Please try again later.",
    message: "Please enter a question of 1–16,000 characters.",
    connection: "The connection dropped. Please try again later.",
    unsupported:
      "This browser cannot display answers. Please try another browser.",
    fallback: "Cannot complete the answer right now. Please try again later.",
  },
};

export default en;

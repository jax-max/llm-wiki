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
    ingest: {
      fetching: "Fetching the source…",
      searching: "Searching wiki pages…",
      writing: "Writing pages…",
      updating: "Updating pages…",
      hashing: "Computing digests…",
      working: "Organizing the ingest…",
    },
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
  ingest: {
    openButton: "＋ Ingest",
    dialogLabel: "Ingest a source",
    intro:
      "Provide a source URL or upload a file. It is preserved as raw evidence, compiled into wiki pages, and written only after you review the preview.",
    urlLabel: "Source URL",
    urlPlaceholder: "https://example.com/article",
    fileLabel: "Or upload a file",
    fileHint: (mb) => `.md / .txt files up to ${mb} MB`,
    clearFile: "Clear selected file",
    submit: "Start ingest",
    submitting: "Submitting…",
    cancel: "Cancel",
    close: "Close",
    stopRun: "■ Cancel ingest",
    runTitle: "Ingesting",
    runSource: "Source",
    previewTitle: "Changes preview",
    added: "Added",
    modified: "Modified",
    statLine: (add, del) => `+${add} / −${del} lines`,
    showDiff: "Show diff",
    hideDiff: "Hide diff",
    summaryLabel: "Ingest summary",
    lintLabel: "Evidence check report",
    warningsLabel: "Notes",
    apply: "Apply to the wiki",
    applying: "Applying…",
    discard: "Discard changes",
    applied:
      "Written to the wiki. You can now query the new knowledge in chat.",
    discarded: "Discarded. The wiki was left unchanged.",
    emptyChanges: "This ingest produced no page changes (raw evidence only).",
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
    duplicate: "This content already exists in raw. No need to ingest again.",
    url: "Please provide a valid http(s) URL.",
    upload: "Only .md / .txt files within the size limit are supported.",
    ingest_disabled: "Ingest is disabled or the model protocol is unsupported.",
    ingest: "The ingest failed. Please try again.",
    turns: "The ingest exceeded its step budget. Please try again.",
    sdk: "Cannot start the ingest engine. Check the installation and retry.",
    conflict: "The wiki changed after the preview. Please re-ingest.",
    state:
      "This action is not allowed in the current state. Refresh and retry.",
  },
};

export default en;

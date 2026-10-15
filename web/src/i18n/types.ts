export type Locale = "zh" | "en";

export const STORAGE_KEY = "llm-wiki-web.locale";

// 词典结构由本接口在编译期锁死：zh.ts / en.ts 任何一侧缺键或多键都会让 tsc 报错。
export interface Copy {
  appTitle: string;
  header: { subtitle: string; newChat: string };
  language: { switch: string };
  welcome: {
    eyebrow: string;
    titleLines: [string, string];
    lead: string;
    suggestions: string[];
  };
  turn: { running: string; done: string; incomplete: string; retry: string };
  progress: {
    search: string;
    readingTitle: (title: string) => string;
    reading: string;
    relations: string;
    streaming: string;
    opening: string;
    ingest: {
      fetching: string;
      searching: string;
      writing: string;
      updating: string;
      hashing: string;
      working: string;
    };
  };
  composer: {
    askAria: string;
    placeholder: string;
    retryPlaceholder: string;
    disclaimer: string;
    send: string;
    stop: string;
  };
  source: {
    panelLabel: string;
    back: string;
    closeAria: string;
    fallbackTitle: string;
    continueReading: string;
    empty: string;
  };
  fatal: { connect: string };
  ingest: {
    openButton: string;
    dialogLabel: string;
    intro: string;
    urlLabel: string;
    urlPlaceholder: string;
    fileLabel: string;
    fileHint: (mb: number) => string;
    clearFile: string;
    submit: string;
    submitting: string;
    cancel: string;
    close: string;
    stopRun: string;
    runTitle: string;
    runSource: string;
    previewTitle: string;
    added: string;
    modified: string;
    statLine: (add: number, del: number) => string;
    showDiff: string;
    hideDiff: string;
    summaryLabel: string;
    lintLabel: string;
    warningsLabel: string;
    apply: string;
    applying: string;
    discard: string;
    applied: string;
    discarded: string;
    emptyChanges: string;
  };
  errors: {
    source: string;
    cancelled: string;
    timeout: string;
    budget: string;
    context: string;
    session: string;
    busy: string;
    capacity: string;
    message: string;
    connection: string;
    unsupported: string;
    fallback: string;
    duplicate: string;
    url: string;
    upload: string;
    ingest_disabled: string;
    ingest: string;
    turns: string;
    sdk: string;
    conflict: string;
    state: string;
  };
}

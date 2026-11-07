import React, { useEffect, useRef, useState } from "react";
import { useLocale } from "./i18n/useLocale";
import IngestDialog from "./ingest/IngestDialog";
import Catalog from "./Catalog";
import WikiSelector from "./WikiSelector";
import {
  isKnowledgePage,
  isSystemPage,
  pageType,
  type CatalogPage,
  type AppliedChange,
} from "./catalog-model";
import { useDocumentReader } from "./useDocumentReader";
import { renderMarkdown, sourceLink } from "./markdown";
import { errorMessage, progressMessage } from "./presentation";
import { readSSE } from "./sse";
export type Config = {
  root?: string;
  wikiId: string;
  name: string;
  ingest?: { available: boolean; maxUploadMb: number; urlSupported?: boolean };
};
type Turn = {
  question: string;
  answer: string;
  status: "running" | "done" | "error" | "stopped";
  error?: string;
  grounded?: boolean;
};
export default function App() {
  const [generation, setGeneration] = useState(0);
  return (
    <Workspace
      key={generation}
      onSwitch={() => setGeneration((value) => value + 1)}
    />
  );
}
function Workspace({ onSwitch }: { onSwitch: () => void }) {
  const { locale, setLocale, t } = useLocale();
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState<"connect" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const knowledge = useDocumentReader(config?.wikiId, locale);
  const knowledgeScroll = useRef<HTMLElement>(null);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(
    () => window.innerWidth >= 1280,
  );
  const [catalogPages, setCatalogPages] = useState<CatalogPage[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [wikiChanged, setWikiChanged] = useState(false);
  const [updates, setUpdates] = useState<AppliedChange[]>([]);
  const [revealUpdates, setRevealUpdates] = useState(0);
  const catalogRequest = useRef(0);
  const session = useRef<string>();
  const controller = useRef<AbortController>();
  const end = useRef<HTMLDivElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const askToggle = useRef<HTMLButtonElement>(null);
  const catalogToggle = useRef<HTMLButtonElement>(null);
  const wasAskOpen = useRef(false);
  useEffect(() => {
    if (askOpen) chatInput.current?.focus({ preventScroll: true });
    else if (wasAskOpen.current)
      askToggle.current?.focus({ preventScroll: true });
    wasAskOpen.current = askOpen;
  }, [askOpen]);
  function closeCatalog() {
    setCatalogOpen(false);
    catalogToggle.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setConfig)
      .catch(() => setFatal("connect"));
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    if (askOpen) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, progress]);
  useEffect(() => {
    if (knowledgeScroll.current) knowledgeScroll.current.scrollTop = 0;
    if (window.innerWidth < 1280)
      knowledgeScroll.current?.focus({ preventScroll: true });
  }, [knowledge.doc?.path]);
  function viewUpdates() {
    setIngestOpen(false);
    setCatalogOpen(true);
    if (window.innerWidth < 1280) setAskOpen(false);
    setRevealUpdates((value) => value + 1);
  }
  async function refreshCatalog() {
    if (!config) return;
    const token = ++catalogRequest.current;
    setCatalogLoading(true);
    setCatalogFailed(false);
    try {
      const response = await fetch(
        "/api/catalog?" + new URLSearchParams({ wikiId: config.wikiId }),
      );
      if (!response.ok) {
        const error = await response.json();
        if (token === catalogRequest.current && error.code === "wiki")
          setWikiChanged(true);
        throw new Error("catalog");
      }
      const data = await response.json();
      if (!Array.isArray(data.pages)) throw new Error("catalog");
      if (token === catalogRequest.current) setCatalogPages(data.pages);
    } catch {
      if (token === catalogRequest.current) setCatalogFailed(true);
    } finally {
      if (token === catalogRequest.current) setCatalogLoading(false);
    }
  }
  useEffect(() => {
    void refreshCatalog();
    return () => {
      ++catalogRequest.current;
    };
  }, [config]);
  function applied(changes: AppliedChange[]) {
    setUpdates(changes);
    void refreshCatalog();
    const current = knowledge.doc?.path;
    if (current && changes.some((change) => change.path === current))
      void knowledge.open(current, false, true);
  }
  function openDocument(path: string) {
    if (window.innerWidth < 1280) {
      setCatalogOpen(false);
      setAskOpen(false);
    }
    return knowledge.open(path);
  }
  async function send(question: string, retry = false) {
    if (!config || busy || !question.trim()) return;
    setAskOpen(true);
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setProgress(t.progress.search);
    setInput("");
    setTurns((old) => [
      ...(retry ? old.slice(0, -1) : old),
      { question, answer: "", status: "running" },
    ]);
    const update = (fn: (t: Turn) => Turn) =>
      setTurns((old) => old.map((t, i) => (i === old.length - 1 ? fn(t) : t)));
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wikiId: config.wikiId,
          message: question,
          sessionId: session.current,
        }),
        signal: abort.signal,
      });
      await readSSE(response, (event, data) => {
        if (event === "session") session.current = data.sessionId;
        else if (event === "progress")
          setProgress(progressMessage(data, locale));
        else if (event === "delta") {
          setProgress(t.progress.streaming);
          update((turn) => ({ ...turn, answer: turn.answer + data.text }));
        } else if (event === "done")
          update((turn) => ({
            ...turn,
            status: "done",
            grounded: data.grounded !== false,
          }));
        else if (event === "error")
          update((turn) => ({
            ...turn,
            status: "error",
            error: errorMessage(data, locale),
          }));
      });
    } catch (e) {
      update((turn) => ({
        ...turn,
        status: abort.signal.aborted ? "stopped" : "error",
        error: abort.signal.aborted
          ? t.errors.cancelled
          : errorMessage(e, locale),
      }));
    } finally {
      setBusy(false);
      setProgress("");
      controller.current = undefined;
    }
  }
  async function reset() {
    controller.current?.abort();
    if (session.current)
      void fetch("/api/chat/" + encodeURIComponent(session.current), {
        method: "DELETE",
      });
    session.current = undefined;
    setTurns([]);
    setInput("");
  }
  const knowledgePage = catalogPages.find(
    (page) => page.path === knowledge.doc?.path,
  );
  const inDomain = knowledgePage && isKnowledgePage(knowledgePage);
  const domainTitle =
    inDomain &&
    (catalogPages.find((page) => page.path === "wiki/overview.md")?.title ||
      config?.name);
  const breadcrumb = knowledge.doc
    ? [
        domainTitle ||
          (knowledge.doc.path.startsWith("raw/")
            ? t.catalog.raw
            : isSystemPage(knowledge.doc.path)
              ? t.catalog.system
              : config?.name || t.catalog.system),
        ...(inDomain ? [t.catalog.types[pageType(knowledgePage)]] : []),
        knowledge.doc.title,
      ].join(" / ")
    : t.views.knowledge;
  const last = turns.at(-1);
  const ingest = config?.ingest;
  return (
    <div className="app-shell">
      {selectorOpen && config && (
        <WikiSelector
          config={config}
          onClose={() => setSelectorOpen(false)}
          onSelected={onSwitch}
        />
      )}
      {wikiChanged && (
        <p role="alert" className="error">
          {t.wiki.stale}
        </p>
      )}
      <header>
        <div className="brand">
          <span className="logo">W</span>
          <div>
            <strong>{config?.name || t.appTitle}</strong>
            <div className="subtitle">{t.header.subtitle}</div>
          </div>
        </div>
        <div className="header-actions">
          {config && (
            <button onClick={() => setSelectorOpen(true)}>
              {t.wiki.switch}
            </button>
          )}
          {ingest?.available && (
            <button onClick={() => setIngestOpen(true)}>
              {t.ingest.openButton}
            </button>
          )}
          <button
            ref={askToggle}
            className="ask-toggle"
            aria-expanded={askOpen}
            aria-controls="knowledge-chat"
            onClick={() => setAskOpen((old) => !old)}
          >
            {t.library.ask}
          </button>
          <button
            type="button"
            className="lang-toggle"
            aria-label={t.language.switch}
            title={t.language.switch}
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          >
            {locale === "zh" ? "EN" : "中"}
          </button>
        </div>
      </header>
      <div className="workspace library-workspace">
        {catalogOpen && (
          <button
            className="catalog-backdrop"
            aria-label={t.catalog.close}
            onClick={closeCatalog}
          />
        )}
        <aside
          id="knowledge-catalog"
          className="catalog-panel"
          aria-label={t.catalog.title}
          hidden={!catalogOpen}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeCatalog();
          }}
        >
          <Catalog
            t={t}
            locale={locale}
            name={config?.name}
            pages={catalogPages}
            updates={updates}
            revealUpdates={revealUpdates}
            activePath={knowledge.doc?.path}
            loading={catalogLoading}
            failed={catalogFailed}
            onRefresh={() => void refreshCatalog()}
            onClose={closeCatalog}
            onOpen={(path) => void openDocument(path)}
          />
        </aside>
        <main className="knowledge-main">
          <div className="knowledge-toolbar">
            <button
              ref={catalogToggle}
              aria-expanded={catalogOpen}
              aria-controls="knowledge-catalog"
              onClick={() => setCatalogOpen((old) => !old)}
            >
              {t.catalog.title}
            </button>
            <nav
              aria-label={t.views.breadcrumb}
              className="knowledge-breadcrumb"
            >
              {breadcrumb}
            </nav>
            {knowledge.documents.length > 1 && (
              <button disabled={knowledge.busy} onClick={knowledge.back}>
                {t.source.back}
              </button>
            )}
          </div>
          <article
            className="knowledge-content"
            ref={knowledgeScroll}
            tabIndex={-1}
            aria-label={t.views.document}
            aria-busy={knowledge.busy}
          >
            {fatal && (
              <p role="alert" className="error">
                {t.fatal.connect}
              </p>
            )}
            <div>
              {knowledge.error && (
                <p role="alert" className="error">
                  {knowledge.error}
                </p>
              )}
              {knowledge.busy && <p role="status">{t.progress.opening}</p>}
              {knowledge.doc && (
                <>
                  <Markdown
                    text={knowledge.doc.text}
                    from={knowledge.doc.path}
                    onOpenSource={(path) => void openDocument(path)}
                    onSourceError={knowledge.showError}
                  />
                  {knowledge.doc.nextOffset !== null && (
                    <button
                      disabled={knowledge.busy}
                      onClick={() =>
                        void knowledge.open(knowledge.doc!.path, true)
                      }
                    >
                      {t.source.continueReading}
                    </button>
                  )}
                </>
              )}
            </div>
            {!knowledge.doc && !knowledge.busy && (
              <section className="knowledge-empty">
                <p>
                  {catalogOpen
                    ? t.library.selectDocument
                    : t.library.openCatalogHint}
                </p>
              </section>
            )}
          </article>
        </main>
        {askOpen && (
          <button
            className="chat-backdrop"
            aria-label={t.library.closeAsk}
            onClick={() => setAskOpen(false)}
          />
        )}
        <aside
          id="knowledge-chat"
          className="chat-panel"
          aria-label={t.library.ask}
          hidden={!askOpen}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAskOpen(false);
          }}
        >
          <div className="chat-toolbar">
            <strong>{t.library.ask}</strong>
            <button onClick={() => void reset()} disabled={busy}>
              {t.header.newChat}
            </button>
            <button
              aria-label={t.library.closeAsk}
              onClick={() => setAskOpen(false)}
            >
              ✕
            </button>
          </div>
          <p className="chat-scope">{t.library.fullScope}</p>
          <div className="chat-main">
            <div className="conversation" aria-live="polite">
              {fatal && (
                <p role="alert" className="error">
                  {t.fatal.connect}
                </p>
              )}
              {!turns.length && (
                <section className="welcome">
                  <h2>{t.library.ask}</h2>
                  <p>{t.welcome.lead}</p>
                  <div className="suggestions">
                    {t.welcome.suggestions.map((q) => (
                      <button
                        key={q}
                        disabled={!config}
                        onClick={() => void send(q)}
                      >
                        {q}
                        <span>↗</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {turns.map((turn, i) => (
                <section className="turn" key={i}>
                  <div className="question">{turn.question}</div>
                  <div className="answer-label">
                    {turn.status === "done" && turn.grounded === false ? (
                      <span className="general">{t.turn.general}</span>
                    ) : (
                      <>
                        WIKI{" "}
                        <span>
                          {turn.status === "running"
                            ? t.turn.running
                            : turn.status === "done"
                              ? t.turn.done
                              : t.turn.incomplete}
                        </span>
                      </>
                    )}
                  </div>
                  <Markdown
                    text={turn.answer}
                    onOpenSource={openDocument}
                    onSourceError={knowledge.showError}
                  />
                  {turn.error && (
                    <div role="alert" className="error">
                      {turn.error}
                    </div>
                  )}
                  {i === turns.length - 1 &&
                    !busy &&
                    (turn.status === "error" || turn.status === "stopped") && (
                      <button
                        className="retry"
                        onClick={() => void send(turn.question, true)}
                      >
                        {t.turn.retry}
                      </button>
                    )}
                </section>
              ))}
              {busy && (
                <div className="progress" role="status">
                  <span className="pulse" />
                  {progress}
                </div>
              )}
              <div ref={end} />
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={chatInput}
                aria-label={t.composer.askAria}
                placeholder={
                  last?.status === "error"
                    ? t.composer.retryPlaceholder
                    : t.composer.placeholder
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                maxLength={16000}
              />
              <div className="composer-footer">
                <span>{t.composer.disclaimer}</span>
                {busy ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      // 先通知服务端中止生成，再中断本地流；无会话时直接本地中断。
                      if (!session.current) {
                        controller.current?.abort();
                        return;
                      }
                      try {
                        const response = await fetch(
                          "/api/chat/" +
                            encodeURIComponent(session.current) +
                            "/cancel",
                          { method: "POST" },
                        );
                        if (response.ok) controller.current?.abort();
                        else setProgress(t.composer.stopFailed);
                      } catch {
                        setProgress(t.composer.stopFailed);
                      }
                    }}
                  >
                    {t.composer.stop}
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!config || !input.trim()}
                  >
                    {t.composer.send}
                  </button>
                )}
              </div>
            </form>
          </div>
        </aside>
      </div>
      {ingestOpen && ingest?.available && (
        <IngestDialog
          wikiId={config!.wikiId}
          maxUploadMb={ingest.maxUploadMb}
          urlSupported={ingest.urlSupported}
          onApplied={applied}
          onViewUpdates={viewUpdates}
          onClose={() => setIngestOpen(false)}
        />
      )}
    </div>
  );
}
function Markdown({
  text,
  from = "",
  onOpenSource,
  onSourceError,
}: {
  text: string;
  from?: string;
  onOpenSource: (path: string) => void;
  onSourceError: (error: unknown) => void;
}) {
  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      onClick={(event) => {
        const a = (event.target as HTMLElement).closest("a");
        if (!a) return;
        event.preventDefault();
        const href = a.getAttribute("href");
        if (!href) return;
        try {
          const link = sourceLink(href, from);
          if (link.external)
            window.open(link.external, "_blank", "noopener,noreferrer");
          else if (link.path) onOpenSource(link.path);
        } catch (e) {
          onSourceError(e);
        }
      }}
    />
  );
}

import React, { Fragment, useEffect, useRef, useState } from "react";
import { useLocale } from "./i18n/useLocale";
import { renderMarkdown, sourceLink } from "./markdown";
import { errorMessage, progressMessage, sourceTitle } from "./presentation";
import { readSSE } from "./sse";
type Config = { wikiId: string; name: string };
type Turn = {
  question: string;
  answer: string;
  status: "running" | "done" | "error" | "stopped";
  error?: string;
};
type Doc = {
  path: string;
  title: string;
  text: string;
  nextOffset: number | null;
  total: number;
};
export default function App() {
  const { locale, setLocale, t } = useLocale();
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState<"connect" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [sources, setSources] = useState<Doc[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [panel, setPanel] = useState(false);
  const session = useRef<string>();
  const controller = useRef<AbortController>();
  const end = useRef<HTMLDivElement>(null);
  const sourceRequest = useRef(0);
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
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, progress]);
  async function openSource(p: string, more = false) {
    if (!config) return;
    const token = ++sourceRequest.current;
    setPanel(true);
    setSourceBusy(true);
    setSourceError("");
    try {
      const current = sources.at(-1);
      const r = await fetch(
        "/api/document?" +
          new URLSearchParams({
            wikiId: config.wikiId,
            path: p,
            ...(more ? { offset: String(current?.nextOffset || 0) } : {}),
          }),
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (token !== sourceRequest.current) return;
      setSources((old) =>
        more
          ? old.map((d, i) =>
              i === old.length - 1 ? { ...data, text: d.text + data.text } : d,
            )
          : [...old, data],
      );
    } catch (e) {
      if (token === sourceRequest.current)
        setSourceError(errorMessage(e, locale, "source"));
    } finally {
      if (token === sourceRequest.current) setSourceBusy(false);
    }
  }
  function showSourceError(error: unknown) {
    setPanel(true);
    setSourceError(errorMessage(error, locale, "source"));
  }
  async function send(question: string, retry = false) {
    if (!config || busy || !question.trim()) return;
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
          update((turn) => ({ ...turn, status: "done" }));
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
    setPanel(false);
    setSources([]);
    setSourceError("");
    ++sourceRequest.current;
  }
  const doc = sources.at(-1);
  const last = turns.at(-1);
  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <span className="logo">W</span>
          <div>
            <strong>{config?.name || t.appTitle}</strong>
            <div className="subtitle">{t.header.subtitle}</div>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="lang-toggle"
            aria-label={t.language.switch}
            title={t.language.switch}
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          >
            {locale === "zh" ? "EN" : "中"}
          </button>
          <button onClick={() => void reset()} disabled={busy}>
            {t.header.newChat}
          </button>
        </div>
      </header>
      <div className="workspace">
        <main>
          <div className="conversation" aria-live="polite">
            {fatal && (
              <p role="alert" className="error">
                {t.fatal.connect}
              </p>
            )}
            {!turns.length && (
              <section className="welcome">
                <div className="eyebrow">{t.welcome.eyebrow}</div>
                <h1>
                  {t.welcome.titleLines.map((line, i) => (
                    <Fragment key={i}>
                      {i > 0 && <br />}
                      {line}
                    </Fragment>
                  ))}
                </h1>
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
                  WIKI{" "}
                  <span>
                    {turn.status === "running"
                      ? t.turn.running
                      : turn.status === "done"
                        ? t.turn.done
                        : t.turn.incomplete}
                  </span>
                </div>
                <Markdown
                  text={turn.answer}
                  onOpenSource={openSource}
                  onSourceError={showSourceError}
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
                  onClick={() => controller.current?.abort()}
                >
                  {t.composer.stop}
                </button>
              ) : (
                <button className="primary" disabled={!config || !input.trim()}>
                  {t.composer.send}
                </button>
              )}
            </div>
          </form>
        </main>
        {panel && (
          <aside aria-label={t.source.panelLabel} className="source-panel">
            <div className="source-toolbar">
              <button
                disabled={sources.length < 2 || sourceBusy}
                onClick={() => {
                  ++sourceRequest.current;
                  setSources((old) => old.slice(0, -1));
                  setSourceError("");
                }}
              >
                {t.source.back}
              </button>
              <span>{t.source.panelLabel}</span>
              <button
                aria-label={t.source.closeAria}
                onClick={() => {
                  ++sourceRequest.current;
                  setSourceBusy(false);
                  setPanel(false);
                }}
              >
                ✕
              </button>
            </div>
            {sourceError && (
              <p role="alert" className="error">
                {sourceError}
              </p>
            )}
            {doc && (
              <>
                <h2>{sourceTitle(doc.title) || t.source.fallbackTitle}</h2>
                <Markdown
                  text={doc.text}
                  from={doc.path}
                  onOpenSource={openSource}
                  onSourceError={showSourceError}
                />
                {doc.nextOffset !== null && (
                  <button
                    disabled={sourceBusy}
                    onClick={() => void openSource(doc.path, true)}
                  >
                    {t.source.continueReading}
                  </button>
                )}
              </>
            )}
            {sourceBusy && <p role="status">{t.progress.opening}</p>}
            {!doc && !sourceBusy && !sourceError && <p>{t.source.empty}</p>}
          </aside>
        )}
      </div>
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

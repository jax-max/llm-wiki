import React, { useEffect, useRef, useState } from "react";
import { renderMarkdown, sourceLink } from "./markdown";
import { readSSE } from "./sse";
import { errorMessage, progressMessage, sourceTitle } from "./presentation";
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
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState("");
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
        if (!r.ok) throw new Error("服务配置不可用");
        return r.json();
      })
      .then(setConfig)
      .catch(() => setFatal("暂时无法连接知识库，请稍后刷新页面。"));
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
        setSourceError(errorMessage(e, "source"));
    } finally {
      if (token === sourceRequest.current) setSourceBusy(false);
    }
  }
  function showSourceError(message: string) {
    setPanel(true);
    setSourceError(message);
  }
  async function send(question: string, retry = false) {
    if (!config || busy || !question.trim()) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setProgress("正在查找相关内容…");
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
        else if (event === "progress") setProgress(progressMessage(data));
        else if (event === "delta") {
          setProgress("正在整理回答…");
          update((t) => ({ ...t, answer: t.answer + data.text }));
        } else if (event === "done") update((t) => ({ ...t, status: "done" }));
        else if (event === "error")
          update((t) => ({ ...t, status: "error", error: errorMessage(data) }));
      });
    } catch (e) {
      update((t) => ({
        ...t,
        status: abort.signal.aborted ? "stopped" : "error",
        error: abort.signal.aborted
          ? "已停止生成，可以重试或继续提问。"
          : errorMessage(e),
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
            <strong>{config?.name || "Wiki 对话"}</strong>
            <div className="subtitle">知识库问答</div>
          </div>
        </div>
        <button onClick={() => void reset()} disabled={busy}>
          ＋ 新建对话
        </button>
      </header>
      <div className="workspace">
        <main>
          <div className="conversation" aria-live="polite">
            {fatal && (
              <p role="alert" className="error">
                {fatal}
              </p>
            )}
            {!turns.length && (
              <section className="welcome">
                <div className="eyebrow">YOUR KNOWLEDGE, CONNECTED</div>
                <h1>
                  从一个问题开始，
                  <br />
                  找到有依据的答案。
                </h1>
                <p>查找相关资料，并随时查看回答的依据。</p>
                <div className="suggestions">
                  {[
                    "用户参与抽奖需要满足什么条件？",
                    "这些规则约束哪些流程？",
                    "抽奖活动有哪些状态？",
                  ].map((q) => (
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
            {turns.map((t, i) => (
              <section className="turn" key={i}>
                <div className="question">{t.question}</div>
                <div className="answer-label">
                  WIKI{" "}
                  <span>
                    {t.status === "running"
                      ? "查询中"
                      : t.status === "done"
                        ? "基于知识库"
                        : "本轮未完成"}
                  </span>
                </div>
                <Markdown
                  text={t.answer}
                  onOpenSource={openSource}
                  onSourceError={showSourceError}
                />
                {t.error && (
                  <div role="alert" className="error">
                    {t.error}
                  </div>
                )}
                {i === turns.length - 1 &&
                  !busy &&
                  (t.status === "error" || t.status === "stopped") && (
                    <button
                      className="retry"
                      onClick={() => void send(t.question, true)}
                    >
                      重试本轮
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
              aria-label="向知识库提问"
              placeholder={
                last?.status === "error"
                  ? "可重试本轮，或继续提问…"
                  : "向知识库提问，或继续追问…"
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
              <span>答案可能有误，请核对引用来源</span>
              {busy ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => controller.current?.abort()}
                >
                  ■ 停止生成
                </button>
              ) : (
                <button className="primary" disabled={!config || !input.trim()}>
                  发送 ↑
                </button>
              )}
            </div>
          </form>
        </main>
        {panel && (
          <aside aria-label="来源阅读" className="source-panel">
            <div className="source-toolbar">
              <button
                disabled={sources.length < 2 || sourceBusy}
                onClick={() => {
                  ++sourceRequest.current;
                  setSources((old) => old.slice(0, -1));
                  setSourceError("");
                }}
              >
                ← 返回
              </button>
              <span>来源阅读</span>
              <button
                aria-label="关闭来源"
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
                <h2>{sourceTitle(doc.title) || "参考资料"}</h2>
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
                    继续阅读
                  </button>
                )}
              </>
            )}
            {sourceBusy && <p role="status">正在打开资料…</p>}
            {!doc && !sourceBusy && !sourceError && (
              <p>点击回答中的引用阅读来源。</p>
            )}
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
  onSourceError: (message: string) => void;
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
          onSourceError(errorMessage(e, "source"));
        }
      }}
    />
  );
}

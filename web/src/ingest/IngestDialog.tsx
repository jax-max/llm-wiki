import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/useLocale";
import { errorMessage, ingestProgressMessage } from "../presentation";
import { readSSE } from "../sse";
type IngestChange = {
  path: string;
  change: "added" | "modified";
  additions: number;
  deletions: number;
  diff: string;
};
type IngestPreview = {
  status: string;
  kind: "url" | "file";
  source: string;
  notices?: string[];
  summary?: string;
  changes?: IngestChange[];
  deleted?: string[];
  warnings?: string[];
  lintReport?: string;
};
type Stage = "form" | "running" | "preview" | "done" | "error";
export default function IngestDialog({
  wikiId,
  maxUploadMb,
  onClose,
}: {
  wikiId: string;
  maxUploadMb: number;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [stage, setStage] = useState<Stage>("form");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File>();
  const [submitting, setSubmitting] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<IngestPreview>();
  const [openDiff, setOpenDiff] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [endNote, setEndNote] = useState("");
  const jobId = useRef<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const eventsAbort = useRef<AbortController>();
  // Event callbacks capture a stale stage closure; mirror it in a ref.
  const stageRef = useRef<Stage>("form");
  stageRef.current = stage;
  useEffect(() => () => eventsAbort.current?.abort(), []);
  async function start() {
    if (!url.trim() && !file) return;
    setSubmitting(true);
    setError("");
    try {
      const response = file
        ? await fetch("/api/ingest", {
            method: "POST",
            body: (() => {
              const form = new FormData();
              form.append("wikiId", wikiId);
              form.append("file", file);
              return form;
            })(),
          })
        : await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wikiId, url: url.trim() }),
          });
      const data = await response.json();
      if (!response.ok) throw data;
      jobId.current = data.jobId;
      setNotices(data.notices || []);
      setSource(file ? file.name : url.trim());
      setStage("running");
      setProgress(t.progress.ingest.working);
      void subscribe();
    } catch (e) {
      setError(errorMessage(e, locale));
    } finally {
      setSubmitting(false);
    }
  }
  async function subscribe() {
    const abort = new AbortController();
    eventsAbort.current = abort;
    try {
      const response = await fetch(
        `/api/ingest/${encodeURIComponent(jobId.current!)}/events`,
        { signal: abort.signal },
      );
      if (!response.ok) throw new Error();
      await readSSE(response, (event, data) => {
        if (event === "progress")
          setProgress(ingestProgressMessage(data, locale));
        else if (event === "delta")
          setLog((old) => old + String(data.text || "") + "\n");
        else if (event === "done") {
          setPreview(data);
          setStage("preview");
        } else if (event === "error") {
          if (data.code === "cancelled") {
            setEndNote(t.ingest.discarded);
            setStage("done");
            return;
          }
          setError(errorMessage(data, locale));
          setStage("error");
        } else if (event === "status" && data.status !== "running") {
          setEndNote(
            data.status === "applied" ? t.ingest.applied : t.ingest.discarded,
          );
          setStage("done");
        }
      });
    } catch {
      // Closing the dialog aborts the stream; only real failures while the
      // job is still running surface as connection errors.
      if (!abort.signal.aborted && stageRef.current === "running") {
        setError(errorMessage({ code: "connection" }, locale));
        setStage("error");
      }
    }
  }
  async function stopRun() {
    await fetch(`/api/ingest/${encodeURIComponent(jobId.current!)}`, {
      method: "DELETE",
    }).catch(() => {});
    setEndNote(t.ingest.discarded);
    setStage("done");
  }
  async function apply() {
    setApplying(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ingest/${encodeURIComponent(jobId.current!)}/apply`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw data;
      setEndNote(t.ingest.applied);
      setStage("done");
    } catch (e) {
      setError(errorMessage(e, locale));
    } finally {
      setApplying(false);
    }
  }
  async function discard() {
    await fetch(`/api/ingest/${encodeURIComponent(jobId.current!)}`, {
      method: "DELETE",
    }).catch(() => {});
    setEndNote(t.ingest.discarded);
    setStage("done");
  }
  const changes = preview?.changes || [];
  return (
    <div className="ingest-overlay" role="presentation">
      <div
        className="ingest-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.ingest.dialogLabel}
      >
        <div className="ingest-head">
          <strong>{t.ingest.dialogLabel}</strong>
          <button
            aria-label={t.ingest.close}
            onClick={onClose}
            disabled={stage === "running"}
          >
            ✕
          </button>
        </div>
        {stage === "form" && (
          <div className="ingest-body">
            <p className="ingest-intro">{t.ingest.intro}</p>
            <label>{t.ingest.urlLabel}</label>
            <input
              type="url"
              value={url}
              placeholder={t.ingest.urlPlaceholder}
              disabled={!!file}
              onChange={(e) => setUrl(e.target.value)}
            />
            <label>{t.ingest.fileLabel}</label>
            <input
              ref={fileInput}
              type="file"
              accept=".md,.txt"
              disabled={!!url.trim()}
              onChange={(e) => setFile(e.target.files?.[0])}
            />
            <span className="ingest-hint">
              {t.ingest.fileHint(maxUploadMb)}
            </span>
            {file && (
              <span className="ingest-hint ingest-file-chosen">
                {file.name}
                <button
                  type="button"
                  className="ingest-clear"
                  aria-label={t.ingest.clearFile}
                  title={t.ingest.clearFile}
                  onClick={() => {
                    setFile(undefined);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  ✕
                </button>
              </span>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="ingest-actions">
              <button onClick={onClose} disabled={submitting}>
                {t.ingest.cancel}
              </button>
              <button
                className="primary"
                disabled={submitting || (!url.trim() && !file)}
                onClick={() => void start()}
              >
                {submitting ? t.ingest.submitting : t.ingest.submit}
              </button>
            </div>
          </div>
        )}
        {stage === "running" && (
          <div className="ingest-body">
            <div className="ingest-source">
              {t.ingest.runSource}：{source}
            </div>
            {notices.map((notice) => (
              <p className="ingest-notice" key={notice}>
                {notice}
              </p>
            ))}
            <div className="progress" role="status">
              <span className="pulse" />
              {progress}
            </div>
            {log && <pre className="ingest-log">{log}</pre>}
            <div className="ingest-actions">
              <button onClick={() => void stopRun()}>{t.ingest.stopRun}</button>
            </div>
          </div>
        )}
        {stage === "preview" && (
          <div className="ingest-body">
            <h3>{t.ingest.previewTitle}</h3>
            {notices.map((notice) => (
              <p className="ingest-notice" key={notice}>
                {notice}
              </p>
            ))}
            {preview?.summary && (
              <details className="ingest-details">
                <summary>{t.ingest.summaryLabel}</summary>
                <pre className="ingest-log">{preview.summary}</pre>
              </details>
            )}
            {!!preview?.warnings?.length && (
              <div className="ingest-warnings">
                <strong>{t.ingest.warningsLabel}</strong>
                {preview.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            {changes.length ? (
              changes.map((change) => (
                <div className="ingest-change" key={change.path}>
                  <button
                    className="ingest-change-head"
                    onClick={() =>
                      setOpenDiff((old) => ({
                        ...old,
                        [change.path]: !old[change.path],
                      }))
                    }
                  >
                    <span className={`badge ${change.change}`}>
                      {change.change === "added"
                        ? t.ingest.added
                        : t.ingest.modified}
                    </span>
                    <span className="ingest-path">{change.path}</span>
                    <span className="ingest-stat">
                      {t.ingest.statLine(change.additions, change.deletions)}
                    </span>
                    <span>
                      {openDiff[change.path]
                        ? t.ingest.hideDiff
                        : t.ingest.showDiff}
                    </span>
                  </button>
                  {openDiff[change.path] && (
                    <pre className="ingest-diff">{change.diff}</pre>
                  )}
                </div>
              ))
            ) : (
              <p>{t.ingest.emptyChanges}</p>
            )}
            {preview?.lintReport && (
              <details className="ingest-details">
                <summary>{t.ingest.lintLabel}</summary>
                <pre className="ingest-log">{preview.lintReport}</pre>
              </details>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="ingest-actions">
              <button onClick={() => void discard()} disabled={applying}>
                {t.ingest.discard}
              </button>
              <button
                className="primary"
                onClick={() => void apply()}
                disabled={applying || !changes.length}
              >
                {applying ? t.ingest.applying : t.ingest.apply}
              </button>
            </div>
          </div>
        )}
        {(stage === "done" || stage === "error") && (
          <div className="ingest-body">
            {stage === "done" ? (
              <p className="ingest-done">{endNote}</p>
            ) : (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="ingest-actions">
              <button className="primary" onClick={onClose}>
                {t.ingest.close}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

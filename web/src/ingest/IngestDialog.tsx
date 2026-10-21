import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/useLocale";
import { errorMessage, ingestProgressMessage } from "../presentation";
import { readSSE } from "../sse";
import type { AppliedChange } from "../catalog-model";
type IngestChange = {
  path: string;
  change: "added" | "modified";
  additions: number;
  deletions: number;
  diff: string;
};
type IngestPreview = {
  id?: string;
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
  urlSupported = true,
  onClose,
  onApplied,
  onViewUpdates,
}: {
  wikiId: string;
  maxUploadMb: number;
  urlSupported?: boolean;
  onClose: () => void;
  onApplied?: (changes: AppliedChange[]) => void;
  onViewUpdates?: () => void;
}) {
  const { locale, t } = useLocale();
  const [stage, setStage] = useState<Stage>("form");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File>();
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<IngestPreview>();
  const [openDiff, setOpenDiff] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [endNote, setEndNote] = useState("");
  const [appliedChanges, setAppliedChanges] = useState<AppliedChange[] | null>(
    null,
  );
  const jobId = useRef<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const eventsAbort = useRef<AbortController>();
  // Event callbacks capture a stale stage closure; mirror it in a ref.
  const stageRef = useRef<Stage>("form");
  stageRef.current = stage;
  const recoveryAbort = useRef<AbortController>();
  useEffect(() => {
    void recover();
    return () => {
      recoveryAbort.current?.abort();
      eventsAbort.current?.abort();
    };
  }, []);
  async function recover() {
    recoveryAbort.current?.abort();
    eventsAbort.current?.abort();
    const abort = new AbortController();
    recoveryAbort.current = abort;
    setRecovering(true);
    setError("");
    try {
      const response = await fetch(
        "/api/ingest/pending?" + new URLSearchParams({ wikiId }),
        { signal: abort.signal },
      );
      const data = await response.json();
      if (abort.signal.aborted) return;
      if (!response.ok) throw data;
      const job: IngestPreview | null = data.job;
      if (job?.id) {
        jobId.current = job.id;
        setSource(job.source);
        setNotices(job.notices || []);
        setPreview(job.status === "preview" ? job : undefined);
        setStage(job.status === "preview" ? "preview" : "running");
        setProgress(t.progress.ingest.working);
        void subscribe();
      } else {
        jobId.current = undefined;
        setStage("form");
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(errorMessage(e, locale));
        setStage("error");
      }
    } finally {
      if (!abort.signal.aborted) setRecovering(false);
    }
  }
  async function start() {
    if (recovering || submitting || (!url.trim() && !file)) return;
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
        if (abort.signal.aborted) return;
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
    if (cancelling) return;
    setCancelling(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ingest/${encodeURIComponent(jobId.current!)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) throw await response.json();
      eventsAbort.current?.abort();
      setEndNote(t.ingest.discarded);
      setStage("done");
    } catch (e) {
      setError(errorMessage(e, locale));
    } finally {
      setCancelling(false);
    }
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
      const applied = (preview?.changes || [])
        .filter((change) => data.applied.includes(change.path))
        .map(({ path, change }) => ({ path, change }));
      setAppliedChanges(applied);
      onApplied?.(applied);
    } catch (e) {
      setError(errorMessage(e, locale));
    } finally {
      setApplying(false);
    }
  }
  async function discard() {
    await stopRun();
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
            disabled={
              recovering ||
              cancelling ||
              submitting ||
              applying ||
              stage === "running"
            }
          >
            ✕
          </button>
        </div>
        {recovering && (
          <p role="status" className="ingest-body">
            {t.wiki.loading}
          </p>
        )}
        {!recovering && stage === "form" && (
          <div className="ingest-body">
            <p className="ingest-intro">{t.ingest.intro}</p>
            <label>{t.ingest.urlLabel}</label>
            <input
              type="url"
              value={url}
              placeholder={t.ingest.urlPlaceholder}
              disabled={submitting || !!file || !urlSupported}
              onChange={(e) => setUrl(e.target.value)}
            />
            {!urlSupported && (
              <span className="ingest-hint">{t.ingest.fileOnly}</span>
            )}
            <label>{t.ingest.fileLabel}</label>
            <input
              ref={fileInput}
              type="file"
              accept=".md,.txt,.docx,.pdf,.pptx"
              disabled={submitting || !!url.trim()}
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
                  disabled={submitting}
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
        {!recovering && stage === "running" && (
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
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="ingest-actions">
              <button onClick={() => void stopRun()} disabled={cancelling}>
                {t.ingest.stopRun}
              </button>
            </div>
          </div>
        )}
        {!recovering && stage === "preview" && (
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
              <button
                onClick={() => void discard()}
                disabled={applying || cancelling}
              >
                {t.ingest.discard}
              </button>
              <button
                className="primary"
                onClick={() => void apply()}
                disabled={applying || cancelling || !changes.length}
              >
                {applying ? t.ingest.applying : t.ingest.apply}
              </button>
            </div>
          </div>
        )}
        {!recovering && (stage === "done" || stage === "error") && (
          <div className="ingest-body">
            {stage === "done" ? (
              <p className="ingest-done">{endNote}</p>
            ) : (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {stage === "done" && appliedChanges && (
              <p className="ingest-update-count">
                {t.ingest.updateCount(
                  appliedChanges.filter((change) => change.change === "added")
                    .length,
                  appliedChanges.filter(
                    (change) => change.change === "modified",
                  ).length,
                )}
              </p>
            )}
            <div className="ingest-actions">
              {stage === "done" && appliedChanges && onViewUpdates && (
                <button className="primary" onClick={onViewUpdates}>
                  {t.ingest.viewUpdates}
                </button>
              )}
              {stage === "error" && (
                <button onClick={() => void recover()}>
                  {t.catalog.retry}
                </button>
              )}
              <button onClick={onClose}>{t.ingest.close}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

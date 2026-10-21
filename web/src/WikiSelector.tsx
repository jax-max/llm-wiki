import { useEffect, useRef, useState } from "react";
import type { Config } from "./App";
import { useLocale } from "./i18n/useLocale";

type Listing = {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
};
export default function WikiSelector({
  config,
  onClose,
  onSelected,
}: {
  config: Config;
  onClose: () => void;
  onSelected: () => void;
}) {
  const { locale, t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [listing, setListing] = useState<Listing>();
  const [input, setInput] = useState(config.root || "");
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const mounted = useRef(true);
  function describe(data: { code?: string; error?: string }) {
    if (data.code === "busy") return t.wiki.busy;
    if (data.code === "wiki") return t.wiki.stale;
    if (data.code === "storage") return t.wiki.storage;
    return locale === "zh" && data.error ? data.error : t.wiki.failed;
  }
  async function browse(path: string, showHidden = hidden) {
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/directories?" +
          new URLSearchParams({ path, hidden: String(showHidden) }),
      );
      const data = await response.json();
      if (!mounted.current || token !== request.current) return;
      if (!response.ok) throw data;
      setListing(data);
      setInput(data.path);
    } catch (error) {
      if (mounted.current && token === request.current) {
        setListing(undefined);
        setError(describe(error as { code?: string; error?: string }));
      }
    } finally {
      if (mounted.current && token === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    void browse(config.root || "");
    return () => {
      mounted.current = false;
      ++request.current;
      previous?.focus();
    };
  }, []);
  async function select() {
    if (!listing || input !== listing.path || loading || selecting) return;
    setSelecting(true);
    setError("");
    try {
      const response = await fetch("/api/wiki/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: listing.path, wikiId: config.wikiId }),
      });
      const data = await response.json();
      if (!response.ok) throw data;
      if (data.wikiId === config.wikiId) onClose();
      else onSelected();
    } catch (error) {
      setError(describe(error as { code?: string; error?: string }));
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="wiki-selector"
      aria-labelledby="wiki-selector-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!selecting) onClose();
      }}
    >
      <div className="ingest-head">
        <strong id="wiki-selector-title">{t.wiki.switch}</strong>
        <button
          onClick={onClose}
          disabled={selecting}
          aria-label={t.wiki.close}
        >
          ✕
        </button>
      </div>
      <div className="ingest-body">
        <p>
          {t.wiki.current}:{" "}
          <span className="wiki-directory-path">{config.root}</span>
        </p>
        <p className="ingest-hint">{t.wiki.hint}</p>
        <form
          className="wiki-path-form"
          onSubmit={(event) => {
            event.preventDefault();
            void browse(input);
          }}
        >
          <label htmlFor="wiki-directory-path">{t.wiki.path}</label>
          <div>
            <input
              id="wiki-directory-path"
              value={input}
              disabled={selecting}
              onChange={(event) => setInput(event.target.value)}
            />
            <button disabled={selecting || !input.trim()}>{t.wiki.go}</button>
          </div>
        </form>
        <label className="wiki-hidden">
          <input
            type="checkbox"
            checked={hidden}
            disabled={selecting}
            onChange={(event) => {
              setHidden(event.target.checked);
              void browse(listing?.path || input, event.target.checked);
            }}
          />
          {t.wiki.hidden}
        </label>
        <button
          disabled={selecting || loading || !listing?.parent}
          onClick={() => listing?.parent && void browse(listing.parent)}
        >
          {t.wiki.parent}
        </button>
        {loading ? (
          <p role="status">{t.wiki.loading}</p>
        ) : (
          listing && (
            <>
              <p className="wiki-directory-path">{listing.path}</p>
              <ul className="wiki-directories" aria-label={t.wiki.path}>
                {listing.directories.map((directory) => (
                  <li key={directory.path}>
                    <button
                      disabled={selecting}
                      onClick={() => void browse(directory.path)}
                    >
                      {directory.name} /
                    </button>
                  </li>
                ))}
              </ul>
              {!listing.directories.length && <p>{t.wiki.empty}</p>}
            </>
          )
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="ingest-actions">
          <button onClick={onClose} disabled={selecting}>
            {t.wiki.close}
          </button>
          <button
            className="primary"
            onClick={() => void select()}
            disabled={
              !listing || input !== listing.path || loading || selecting
            }
          >
            {selecting ? t.wiki.loading : t.wiki.select}
          </button>
        </div>
      </div>
    </dialog>
  );
}

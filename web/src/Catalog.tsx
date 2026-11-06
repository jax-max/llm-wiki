import { useEffect, useRef, useState } from "react";
import type { Copy, Locale } from "./i18n/types";
import {
  knowledgeTypes,
  isSystemPage,
  isKnowledgePage,
  pageType,
  type CatalogPage,
  type AppliedChange,
} from "./catalog-model";

export default function Catalog({
  pages,
  updates,
  activePath,
  loading,
  failed,
  onRefresh,
  onOpen,
  onClose,
  t,
  locale,
  name,
  revealUpdates = 0,
}: {
  t: Copy;
  locale: Locale;
  name?: string;
  pages: CatalogPage[];
  updates: AppliedChange[];
  activePath?: string;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
  onOpen: (path: string) => void;
  onClose: () => void;
  revealUpdates?: number;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const selected = useRef<HTMLButtonElement>(null);
  const revealRequested = useRef(false);
  const revealedPath = useRef<string>();
  const labels = t.catalog;
  const recentSection = useRef<HTMLElement>(null);
  const revealRecent = useRef(false);
  useEffect(() => {
    if (!revealUpdates) return;
    revealRecent.current = true;
    setFilter("");
    setExpanded((old) => ({ ...old, recent: true }));
  }, [revealUpdates]);
  useEffect(() => {
    if (!revealRecent.current || filter || !expanded.recent) return;
    revealRecent.current = false;
    recentSection.current?.focus({ preventScroll: true });
    recentSection.current?.scrollIntoView({ block: "nearest" });
  }, [filter, expanded]);
  useEffect(() => {
    if (!activePath) return;
    const page = pages.find((p) => p.path === activePath);
    if (!page || revealedPath.current === activePath) return;
    revealedPath.current = activePath;
    revealRequested.current = true;
    expandFor(page);
  }, [activePath, pages]);
  useEffect(() => {
    if (revealRequested.current && selected.current) {
      selected.current.scrollIntoView({ block: "nearest" });
      revealRequested.current = false;
    }
  }, [activePath, expanded]);
  const sort = (items: CatalogPage[]) =>
    [...items].sort(
      (a, b) =>
        a.title.localeCompare(b.title, locale) || a.path.localeCompare(b.path),
    );
  const visible = sort(
    pages.filter((p) =>
      `${p.title}\n${p.path}`
        .toLocaleLowerCase()
        .includes(filter.trim().toLocaleLowerCase()),
    ),
  );
  const expandFor = (page: CatalogPage) =>
    setExpanded((old) => ({
      ...old,
      ...(isKnowledgePage(page)
        ? { knowledge: true, [`type:${pageType(page)}`]: true }
        : { [page.path.startsWith("raw/") ? "raw" : "system"]: true }),
    }));
  const status = new Map(updates.map((u) => [u.path, u.change]));
  const row = (page: CatalogPage, recent = false) => (
    <li key={page.path}>
      <button
        type="button"
        className={`catalog-page${activePath === page.path ? " selected" : ""}`}
        ref={!recent && activePath === page.path ? selected : undefined}
        aria-current={activePath === page.path ? "page" : undefined}
        title={page.path}
        onClick={() => {
          revealRequested.current = true;
          expandFor(page);
          onOpen(page.path);
        }}
      >
        <span>{page.title}</span>
        {status.has(page.path) && (
          <small className={`catalog-badge ${status.get(page.path)}`}>
            {status.get(page.path) === "added"
              ? t.ingest.added
              : t.ingest.modified}
          </small>
        )}
      </button>
    </li>
  );
  const group = (
    key: string,
    title: string,
    children: React.ReactNode,
    open = false,
  ) => (
    <li key={key}>
      <button
        type="button"
        className="catalog-group"
        aria-expanded={!!filter || (expanded[key] ?? open)}
        onClick={() =>
          setExpanded((old) => ({ ...old, [key]: !(old[key] ?? open) }))
        }
      >
        <span aria-hidden="true">
          {filter || (expanded[key] ?? open) ? "▾" : "▸"}
        </span>{" "}
        {title}
      </button>
      {(filter || (expanded[key] ?? open)) && <ul>{children}</ul>}
    </li>
  );
  return (
    <>
      <div className="catalog-toolbar">
        <strong>{labels.title}</strong>
        <button onClick={onClose} aria-label={labels.close}>
          ✕
        </button>
      </div>
      <div className="catalog-controls">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={labels.filter}
          placeholder={labels.filter}
        />
        <button onClick={onRefresh} disabled={loading}>
          {labels.refresh}
        </button>
      </div>
      {loading && <p role="status">{labels.loading}</p>}
      {failed && (
        <p role="alert">
          {labels.failed} <button onClick={onRefresh}>{labels.retry}</button>
        </p>
      )}
      <div className="catalog-scroll">
        {!!updates.length && (
          <section aria-label={labels.recent} ref={recentSection} tabIndex={-1}>
            <button
              className="catalog-group"
              aria-expanded={!!filter || !!expanded.recent}
              onClick={() =>
                setExpanded((old) => ({ ...old, recent: !old.recent }))
              }
            >
              <span aria-hidden="true">
                {filter || expanded.recent ? "▾" : "▸"}
              </span>{" "}
              {labels.recent}
            </button>
            {(filter || expanded.recent) && (
              <ul>
                {updates
                  .filter((u) =>
                    `${pages.find((p) => p.path === u.path)?.title || ""}\n${u.path}`
                      .toLowerCase()
                      .includes(filter.trim().toLowerCase()),
                  )
                  .map((u) =>
                    row(
                      pages.find((p) => p.path === u.path) || {
                        path: u.path,
                        title: u.path.split("/").at(-1)!,
                      },
                      true,
                    ),
                  )}
              </ul>
            )}
          </section>
        )}
        {!loading && !failed && !visible.length && <p>{labels.empty}</p>}
        <nav aria-label={labels.title}>
          <ul>
            {(() => {
              const knowledge = visible.filter(isKnowledgePage);
              if (!knowledge.length) return null;
              const overview = pages.find((p) =>
                /\/overview\.(md|txt)$/i.test(p.path),
              );
              return group(
                "knowledge",
                overview?.title || name || "wiki",
                knowledgeTypes.map((type) => {
                  const typed = knowledge.filter((p) => pageType(p) === type);
                  return !typed.length
                    ? null
                    : type === "Overview"
                      ? typed.map((p) => row(p))
                      : group(
                          `type:${type}`,
                          labels.types[type],
                          typed.map((p) => row(p)),
                        );
                }),
                true,
              );
            })()}
            {group(
              "raw",
              labels.raw,
              visible
                .filter((p) => p.path.startsWith("raw/"))
                .map((p) => row(p)),
            )}
            {group(
              "system",
              labels.system,
              visible.filter((p) => isSystemPage(p.path)).map((p) => row(p)),
            )}
          </ul>
        </nav>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Locale } from "./i18n/types";
import { errorMessage } from "./presentation";

type Doc = {
  path: string;
  title: string;
  text: string;
  nextOffset: number | null;
  total: number;
};
export function useDocumentReader(wikiId: string | undefined, locale: Locale) {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      ++request.current;
    },
    [],
  );
  function cancel() {
    ++request.current;
    setBusy(false);
  }
  async function open(path: string, more = false, replace = false) {
    if (!wikiId) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/document?" +
          new URLSearchParams({
            wikiId,
            path,
            ...(more
              ? { offset: String(documents.at(-1)?.nextOffset || 0) }
              : {}),
          }),
      );
      const doc: Doc = await response.json();
      if (!response.ok) throw doc;
      if (token !== request.current) return;
      setDocuments((old) =>
        more
          ? old.map((d, index) =>
              index === old.length - 1
                ? { ...doc, text: d.text + doc.text }
                : d,
            )
          : replace
            ? [...old.slice(0, -1), doc]
            : [...old, doc],
      );
    } catch (e) {
      if (token === request.current)
        setError(errorMessage(e, locale, "source"));
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function back() {
    cancel();
    setDocuments((old) => old.slice(0, -1));
    setError("");
  }
  function reset() {
    cancel();
    setDocuments([]);
    setError("");
  }
  function showError(e: unknown) {
    cancel();
    setError(errorMessage(e, locale, "source"));
  }
  return {
    documents,
    doc: documents.at(-1),
    busy,
    error,
    open,
    back,
    reset,
    cancel,
    showError,
  };
}

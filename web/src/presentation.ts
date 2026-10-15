// User-facing copy is deliberately independent of tool labels and error details.
import { dictionaries } from "./i18n";
import type { Locale } from "./i18n/types";

export function sourceTitle(title: unknown): string {
  if (typeof title !== "string") return "";
  const value = title.trim();
  if (/^(?:wiki|raw)\//i.test(value) || /\.(?:md|txt)$/i.test(value)) return "";
  return value;
}

export function progressMessage(
  data: {
    tool?: string;
    documentTitle?: unknown;
  },
  locale: Locale,
): string {
  const { progress } = dictionaries[locale];
  if (data.tool === "read_document") {
    const title = sourceTitle(data.documentTitle);
    return title ? progress.readingTitle(title) : progress.reading;
  }
  if (data.tool === "wiki_relations") return progress.relations;
  return progress.search;
}

export function errorMessage(
  error: unknown,
  locale: Locale,
  context: "chat" | "source" = "chat",
): string {
  const { errors } = dictionaries[locale];
  if (context === "source") return errors.source;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const known: Record<string, string> = {
    cancelled: errors.cancelled,
    timeout: errors.timeout,
    budget: errors.budget,
    context: errors.context,
    session: errors.session,
    busy: errors.busy,
    capacity: errors.capacity,
    message: errors.message,
    connection: errors.connection,
    unsupported: errors.unsupported,
  };
  return (typeof code === "string" && known[code]) || errors.fallback;
}

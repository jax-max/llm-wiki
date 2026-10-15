import en from "./en";
import type { Copy, Locale } from "./types";
import zh from "./zh";

export { STORAGE_KEY } from "./types";
export type { Copy, Locale } from "./types";

export const dictionaries: Record<Locale, Copy> = { zh, en };

// 取主子标签并忽略大小写："zh-CN"/"zh_TW" → "zh"，"en-US" → "en"，其余 undefined。
export function parseLocale(value?: string | null): Locale | undefined {
  if (typeof value !== "string") return undefined;
  const primary = value.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary === "zh" || primary === "en" ? primary : undefined;
}

// 解析顺序：手动选择（localStorage）优先，其次浏览器语言列表，最后兜底。
// 兜底语言是产品决策：当前默认中文；如需改为英文，只动最后一行。
export function resolveLocale(
  persisted: string | null | undefined,
  preferred: readonly string[],
): Locale {
  const stored = parseLocale(persisted);
  if (stored) return stored;
  for (const tag of preferred) {
    const locale = parseLocale(tag);
    if (locale) return locale;
  }
  return "zh";
}

export function documentLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

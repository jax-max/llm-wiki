import { useEffect, useState } from "react";
import { dictionaries, documentLang, resolveLocale } from "./index";
import { STORAGE_KEY } from "./types";
import type { Copy, Locale } from "./types";

// 本模块是 i18n 中唯一允许访问 window/document 的位置，
// 且只允许在 hook 内部访问（不在模块顶层），便于 JSDOM 测试装配 globalThis 后再加载。
function initialLocale(): Locale {
  try {
    return resolveLocale(
      window.localStorage.getItem(STORAGE_KEY),
      window.navigator.languages ?? [window.navigator.language],
    );
  } catch {
    return "zh";
  }
}

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Copy;
} {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 隐私模式等场景下持久化失败不影响当前会话。
    }
  };
  const t = dictionaries[locale];
  useEffect(() => {
    document.documentElement.lang = documentLang(locale);
    document.title = t.appTitle;
  }, [locale, t]);
  return { locale, setLocale, t };
}

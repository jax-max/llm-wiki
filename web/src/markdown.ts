import { Marked } from "marked";
import DOMPurify from "dompurify";
const marked = new Marked({
  renderer: { html: () => "", image: () => "" },
  breaks: true,
});
export function renderMarkdown(text: string) {
  return DOMPurify.sanitize(marked.parse(text, { async: false }), {
    FORBID_TAGS: ["img", "video", "audio", "iframe", "style", "form", "input"],
    FORBID_ATTR: ["style", "src", "srcset"],
  });
}
export function sourceLink(
  href: string,
  from = "",
): { external?: string; path?: string; anchor?: string } {
  if (href.startsWith("#")) return { anchor: href };
  if (/^https?:\/\//i.test(href)) return { external: href };
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split("#")[0]);
  } catch {
    throw new Error("来源链接编码无效");
  }
  if (
    /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(decoded) ||
    /[\\\u0000-\u001f?:]/.test(decoded)
  )
    throw new Error("不支持此来源链接");
  const parts = (
    /^(wiki|raw)\//.test(decoded)
      ? decoded
      : (from ? from.slice(0, from.lastIndexOf("/") + 1) : "") + decoded
  ).split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (!result.length) throw new Error("来源路径越界");
      result.pop();
    } else if (part !== "." && part) result.push(part);
  }
  const p = result.join("/");
  if (!/^(wiki|raw)\/.+\.(md|txt)$/i.test(p))
    throw new Error("来源不是可读的 wiki/raw 文档");
  return { path: p };
}

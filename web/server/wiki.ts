import path from "node:path";
import { realpath, readFile, readdir, stat } from "node:fs/promises";
export class QueryError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function documentPath(input: string, from = ""): string {
  if (
    !input ||
    /[\\\u0000-\u001f]/.test(input) ||
    /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(input)
  )
    throw new QueryError("path", "无效文档路径");
  let decoded: string;
  try {
    decoded = decodeURIComponent(input.split("#")[0]);
  } catch {
    throw new QueryError("path", "无效文档路径");
  }
  if (/[\\\u0000-\u001f?:]/.test(decoded) || decoded.startsWith("/"))
    throw new QueryError("path", "无效文档路径");
  const result = path.posix.normalize(
    /^(wiki|raw)\//.test(decoded)
      ? decoded
      : path.posix.join(path.posix.dirname(from || "."), decoded),
  );
  if (!/^(wiki|raw)\/.+\.(md|txt)$/i.test(result))
    throw new QueryError("path", "文档不在 wiki/ 或 raw/ 范围内");
  return result;
}
export class Wiki {
  constructor(public root: string) {}
  async resolve(input: string) {
    const relative = documentPath(input);
    const root = await realpath(this.root);
    let target: string;
    try {
      target = await realpath(path.join(root, relative));
    } catch {
      throw new QueryError("missing", "来源不存在", 404);
    }
    const canonical = path.relative(root, target).split(path.sep).join("/");
    if (
      target === root ||
      !target.startsWith(root + path.sep) ||
      !/^(wiki|raw)\/.+\.(md|txt)$/i.test(canonical)
    )
      throw new QueryError("path", "来源路径越界");
    const s = await stat(target);
    if (!s.isFile() || s.size > 8 * 1024 * 1024)
      throw new QueryError("document", "来源不是文档或超过 8 MB");
    return { target, relative: canonical };
  }
  async read(input: string, offset = 0, limit = 16000) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50000
    )
      throw new QueryError("range", "读取范围无效");
    const { target, relative } = await this.resolve(input);
    const text = await readFile(target, "utf8");
    return {
      path: relative,
      title: text.match(/^#\s+(.+)$/m)?.[1] || path.basename(relative),
      text: text.slice(offset, offset + limit),
      offset,
      total: text.length,
      nextOffset: offset + limit < text.length ? offset + limit : null,
    };
  }
  async snapshot() {
    const pages: { path: string; title: string; type: string; text: string }[] =
      [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(path.join(this.root, dir), {
        withFileTypes: true,
      })) {
        const p = dir + "/" + entry.name;
        if (entry.isDirectory()) await walk(p);
        else if (entry.isFile() && /\.md$/i.test(p)) {
          const doc = await this.read(p, 0, 50000);
          doc.text = await readFile((await this.resolve(p)).target, "utf8");
          pages.push({
            ...doc,
            type: doc.text.match(/^>\s*Type:\s*(.+)$/m)?.[1] || "Overview",
          });
        }
      }
    };
    // Never recurse through symlink directories; each file is checked again on read.
    await this.resolve("wiki/schema.md");
    const domain = await realpath(path.join(this.root, "wiki/domains"));
    const root = await realpath(this.root);
    if (!domain.startsWith(root + path.sep + "wiki" + path.sep))
      throw new QueryError("path", "知识页目录越界");
    await walk("wiki/domains");
    const schema = await this.read("wiki/schema.md", 0, 50000);
    const inverses = new Map<string, string | null>();
    for (const line of schema.text.split("\n")) {
      const cells = line.split("|").map((s) => s.trim());
      if (cells.length === 6 && /^[a-z-]+$/.test(cells[1]))
        inverses.set(cells[1], cells[4] === "None" ? null : cells[4]);
    }
    const edges: {
      source: string;
      target: string;
      verb: string;
      inverse: string | null;
      broken: boolean;
    }[] = [];
    for (const p of pages) {
      const section =
        p.text.match(
          /^## Relations\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
        )?.[1] || "";
      for (const m of section.matchAll(
        /^-\s+([\w-]+):\s*\[[^\]]*\]\(([^)]+)\)/gm,
      )) {
        try {
          const target = documentPath(m[2], p.path);
          edges.push({
            source: p.path,
            target,
            verb: m[1],
            inverse: inverses.get(m[1]) ?? null,
            broken: !pages.some((p) => p.path === target),
          });
        } catch {
          /* Unsafe links are not traversable. */
        }
      }
    }
    return {
      pages,
      search: (query: string) => {
        const words = query
          .normalize("NFKC")
          .toLowerCase()
          .split(/[\s,，;；]+/)
          .filter(Boolean);
        return pages
          .map((p) => {
            const text = p.text.normalize("NFKC").toLowerCase();
            const hits = words.filter((w) => text.includes(w));
            const at = text.indexOf(hits[0] || "");
            return {
              path: p.path,
              title: p.title,
              type: p.type,
              score:
                hits.length +
                hits.filter((w) => p.title.toLowerCase().includes(w)).length,
              excerpt: p.text.slice(
                Math.max(0, at - 100),
                Math.max(0, at - 100) + 700,
              ),
            };
          })
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);
      },
      relations: (p: string) =>
        edges
          .filter((e) => e.source === p || e.target === p)
          .map((e) => ({
            ...e,
            direction: e.source === p ? "outgoing" : "incoming",
          })),
    };
  }
}

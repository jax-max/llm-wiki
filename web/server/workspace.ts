import path from "node:path";
import { constants } from "node:fs";
import {
  access,
  stat,
  realpath,
  readdir,
  readFile,
  mkdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { Wiki, QueryError } from "./wiki.js";

export async function validateWikiRoot(input: string): Promise<string> {
  if (
    typeof input !== "string" ||
    !path.isAbsolute(input) ||
    /[\u0000-\u001f]/.test(input)
  )
    throw new QueryError("path", "请选择有效的绝对目录路径");
  const root = await realpath(input).catch(() => {
    throw new QueryError("path", "WIKI_ROOT 根目录不存在或无法访问");
  });
  for (const [relative, directory] of [
    ["wiki/schema.md", false],
    ["wiki/index.md", false],
    ["wiki/overview.md", false],
    ["raw", true],
  ] as const) {
    try {
      const target = path.join(input, relative);
      await access(target, constants.R_OK | (directory ? constants.X_OK : 0));
      const canonical = await realpath(target);
      if (!canonical.startsWith(root + path.sep)) throw new Error();
      const info = await stat(target);
      if (directory ? !info.isDirectory() : !info.isFile()) throw new Error();
    } catch {
      throw new QueryError(
        "path",
        `WIKI_ROOT 缺少可读${directory ? "目录" : "文件"}：${relative}`,
      );
    }
  }
  await new Wiki(root).snapshot();
  return root;
}

export async function restoreWikiRoot(
  file: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    console.warn("无法读取上次选择的 Wiki，将使用 WIKI_ROOT 配置。");
    return undefined;
  }
  try {
    return await validateWikiRoot(JSON.parse(text).root);
  } catch {
    console.warn("无法恢复上次选择的 Wiki，将使用 WIKI_ROOT 配置。");
    return undefined;
  }
}

export async function saveWikiRoot(file: string, root: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ root }) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function browseDirectories(input: string, hidden = false) {
  if (
    typeof input !== "string" ||
    !path.isAbsolute(input) ||
    /[\u0000-\u001f]/.test(input)
  )
    throw new QueryError("path", "请选择有效的绝对目录路径");
  try {
    const current = await realpath(input);
    await access(current, constants.R_OK | constants.X_OK);
    const entries = await readdir(current, { withFileTypes: true });
    return {
      path: current,
      parent: path.dirname(current) === current ? null : path.dirname(current),
      directories: entries
        .filter((e) => e.isDirectory() && (hidden || !e.name.startsWith(".")))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ name: e.name, path: path.join(current, e.name) })),
    };
  } catch {
    throw new QueryError("path", "目录不存在或无法访问");
  }
}

// The synchronous reservation spans all awaited work, including upload parsing.
export class WorkspaceSwitch {
  private stopped = false;
  close() {
    this.stopped = true;
  }
  private checkOpen() {
    if (this.stopped) throw new QueryError("cancelled", "服务停止", 503);
  }
  private selecting = false;
  private operations = 0;
  constructor(
    private c: Config,
    private file: string,
    private blocked: () => boolean,
    private changed: () => void,
  ) {}
  acquire() {
    this.checkOpen();
    if (this.selecting)
      throw new QueryError("busy", "正在切换 Wiki，请稍后重试", 409);
    this.operations++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.operations--;
      }
    };
  }
  async select(input: string, wikiId: string) {
    this.checkOpen();
    if (wikiId !== this.c.wikiId)
      throw new QueryError("wiki", "Wiki 已切换，请刷新页面", 409);
    if (this.selecting || this.operations || this.blocked())
      throw new QueryError(
        "busy",
        "请先完成或取消问答、摄入任务及未确认预览",
        409,
      );
    this.selecting = true;
    try {
      const root = await validateWikiRoot(input);
      this.checkOpen();
      if (root === this.c.root) return;
      try {
        await saveWikiRoot(this.file, root);
      } catch {
        throw new QueryError(
          "storage",
          "无法保存 Wiki 选择，原 Wiki 保持不变",
          500,
        );
      }
      this.checkOpen();
      Object.assign(this.c, {
        root,
        name: path.basename(root),
        wikiId: randomUUID(),
      });
      this.changed();
    } finally {
      this.selecting = false;
    }
  }
}

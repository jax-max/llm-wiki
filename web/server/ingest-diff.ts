const CONTEXT = 3;
// Beyond this the LCS matrix (n×m of Uint16) stops being cheap; fall back to
// treating the whole middle section as one replace hunk.
const LCS_LIMIT = 2000;
export type DiffLine = { type: " " | "-" | "+"; text: string };
export type DiffHunk = {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};
type Row = DiffLine & { oldNo: number; newNo: number };
function lcsScript(
  oldLines: string[],
  newLines: string[],
): { type: " " | "-" | "+"; text: string }[] {
  const n = oldLines.length;
  const m = newLines.length;
  if (n > LCS_LIMIT || m > LCS_LIMIT) {
    const script: { type: " " | "-" | "+"; text: string }[] = [];
    for (const text of oldLines) script.push({ type: "-", text });
    for (const text of newLines) script.push({ type: "+", text });
    return script;
  }
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * width + j] =
        oldLines[i] === newLines[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  const script: { type: " " | "-" | "+"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      script.push({ type: " ", text: oldLines[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      script.push({ type: "-", text: oldLines[i] });
      i++;
    } else {
      script.push({ type: "+", text: newLines[j] });
      j++;
    }
  }
  while (i < n) script.push({ type: "-", text: oldLines[i++] });
  while (j < m) script.push({ type: "+", text: newLines[j++] });
  return script;
}
export function diffLines(
  oldText: string,
  newText: string,
): {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
} {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  // Trim the common prefix and suffix so the LCS only sees the changed middle.
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  )
    start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldLines[oldEnd - 1] === newLines[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const script = lcsScript(
    oldLines.slice(start, oldEnd),
    newLines.slice(start, newEnd),
  );
  const rows: Row[] = [];
  let oldNo = 0;
  let newNo = 0;
  const mark = (type: " " | "-" | "+", text: string) => {
    rows.push({
      type,
      text,
      oldNo: type === "+" ? 0 : ++oldNo,
      newNo: type === "-" ? 0 : ++newNo,
    });
  };
  for (let k = 0; k < start; k++) mark(" ", oldLines[k]);
  for (const step of script) mark(step.type, step.text);
  for (let k = newEnd; k < newLines.length; k++) mark(" ", newLines[k]);
  const additions = rows.filter((r) => r.type === "+").length;
  const deletions = rows.filter((r) => r.type === "-").length;
  // Change blocks, each padded with context; overlapping windows merge into
  // one hunk so no change is ever split from its neighbourhood.
  const windows: [number, number][] = [];
  let blockStart = -1;
  const closeBlock = (end: number) => {
    if (blockStart < 0) return;
    const from = Math.max(0, blockStart - CONTEXT);
    const to = Math.min(rows.length - 1, end + CONTEXT);
    const previous = windows.at(-1);
    if (previous && from <= previous[1] + 1)
      previous[1] = Math.max(previous[1], to);
    else windows.push([from, to]);
    blockStart = -1;
  };
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].type === " ") closeBlock(k - 1);
    else if (blockStart < 0) blockStart = k;
  }
  closeBlock(rows.length - 1);
  const hunks: DiffHunk[] = windows.map(([from, to]) => {
    const window = rows.slice(from, to + 1);
    const anchor = (kind: "oldNo" | "newNo") => {
      for (const row of window) if (row[kind]) return row[kind];
      // Pure insertion/deletion has no such row: anchor one line earlier.
      return rows[from - 1]?.[kind] || 0;
    };
    return {
      oldStart: anchor("oldNo"),
      newStart: anchor("newNo"),
      lines: window.map(({ type, text }) => ({ type, text })),
    };
  });
  return { hunks, additions, deletions };
}
export function formatDiff(
  file: string,
  hunks: DiffHunk[],
  maxLines = 400,
): string {
  if (!hunks.length) return "";
  const out: string[] = [`--- a/${file}`, `+++ b/${file}`];
  let shown = 0;
  let truncated = false;
  for (const hunk of hunks) {
    const oldCount = hunk.lines.filter((l) => l.type !== "+").length;
    const newCount = hunk.lines.filter((l) => l.type !== "-").length;
    const body = hunk.lines.map((l) => l.type + l.text);
    const budget = maxLines - shown;
    if (budget <= 0) {
      truncated = true;
      break;
    }
    out.push(
      `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`,
      ...body.slice(0, budget),
    );
    if (body.length > budget) {
      truncated = true;
      break;
    }
    shown += body.length;
  }
  if (truncated) out.push("… 以下 diff 已截断");
  return out.join("\n");
}

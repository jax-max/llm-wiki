export type CatalogPage = { path: string; title: string; type?: string };
export type AppliedChange = { path: string; change: "added" | "modified" };
export const knowledgeTypes = [
  "Overview",
  "Entity",
  "Rule",
  "Workflow",
  "StateMachine",
  "Event",
  "Other",
] as const;
export function isSystemPage(path: string) {
  return /^wiki\/(schema|index|log)\.md$/i.test(path);
}
export function isKnowledgePage(page: CatalogPage) {
  return page.path.startsWith("wiki/") && !isSystemPage(page.path);
}
export function pageType(page: CatalogPage): (typeof knowledgeTypes)[number] {
  const type =
    page.type ||
    (/\/overview\.(md|txt)$/i.test(page.path) ? "Overview" : "Other");
  return knowledgeTypes.includes(type as (typeof knowledgeTypes)[number])
    ? (type as (typeof knowledgeTypes)[number])
    : "Other";
}

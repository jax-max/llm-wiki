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
export function pageDomain(page: CatalogPage) {
  return page.path.match(/^wiki\/domains\/([^/]+)\//)?.[1];
}
export function pageType(page: CatalogPage): (typeof knowledgeTypes)[number] {
  const type =
    page.type ||
    (/\/overview\.(md|txt)$/i.test(page.path) ? "Overview" : "Other");
  return knowledgeTypes.includes(type as (typeof knowledgeTypes)[number])
    ? (type as (typeof knowledgeTypes)[number])
    : "Other";
}

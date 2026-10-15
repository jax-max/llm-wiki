---
name: wiki-ingest
description: Ingest a URL, file, or pasted source into a workflow-oriented research wiki as source-grounded Entity, Workflow, Rule, StateMachine, or Event knowledge. Supports batch ingest of a link list. Chinese triggers: 摄入, 整理这篇文章, 处理这个链接, 批量摄入, 处理这份清单.
---

# Ingest Research Knowledge

Require `wiki/schema.md`; otherwise direct the user to `wiki-init`. Read the
schema and relevant domain overview before writing.

1. Save source text unchanged in meaning to
   `raw/<source-domain>/YYYY-MM-DD-<slug>.md`, using the raw template. Immediately
   compute the saved file's SHA-256 digest — try `sha256sum <file>` first (Linux
   and Windows git-bash), then `shasum -a 256 <file>` (macOS), then
   `powershell.exe -NoProfile -Command "(Get-FileHash -Algorithm SHA256 <file>).Hash"`
   — and record it as the `- SHA-256:` line of its log entry, right after `- Raw:`.
2. Search `wiki/domains/` by names, aliases, and related terms.
3. Read the entire source and create a candidate matrix for every Page Type
   declared in `wiki/schema.md` before writing. For each Type, record exactly
   one disposition: `Added`, `Updated`, `Reused`, or `N/A`. `N/A` needs a
   source-grounded reason; do not treat an unseen page as automatically N/A.
   Classify each durable item:
   - **Entity**: an identifiable person, organization, product, place, or other instance.
   - **Workflow**: an ordered collaboration across entities, rules, or state machines.
   - **Rule**: a business rule, mechanism, strategy, or algorithm.
   - **StateMachine**: an entity's states and lifecycle transitions.
   - **Event**: a business-significant domain occurrence. Prefer event types
     such as a participation, issuance, or approval; add a concrete instance
     when the source gives its specific time, participants, or context.
4. Put the page in its one primary domain; create a new domain only when no
   existing one can own the page, and make it the smallest domain that can.
   Reuse an existing page when identity
   matches; do not duplicate a cross-domain entity. Put an entity's definition
   and boundary in its `Overview`; do not create pages merely to define a noun.
   Its path declares the Domain; do not add a required Domain field. Use
   relations for other domains. Apply the modeling economy criteria below
   before creating a page.
5. Create/update the pages the matrix calls for, from the matching page template,
   stamping each page `Updated: {today}` (the freshness check requires it). Every
   precise number, date, or quotation must appear verbatim in one or more linked Raw
   files. State derived values with their source components. For existing pages,
   follow the update rules below.
6. Update the domain overview and global index. Append the source's full matrix as
   the `### Coverage` table in its log entry. Each non-`N/A` row lists every current
   page grounded in that Raw, including reused pages. If the source adds no
   durable knowledge, retain only the Raw file and log `Disposition: No
   material`; it needs no Coverage table.

Use only relation signatures from `wiki/schema.md`; each relation's source and
target Types must match its signature. Every target must be a relative
Markdown link to an existing typed page. Relations are unqualified: describe
conditional relationships in the owning page's prose with links to the relevant
pages instead of asserting an unconditional edge. Do not create standalone claim
pages or duplicate inverse links.

Keep applicability, exceptions, and source-stated effective dates with the
Entity, Rule, Workflow, or StateMachine they qualify. A date or condition alone
does not make an Event. For example, a refund window for enterprise customers
belongs in a Rule; a completed refund is an Event. A rule's publication,
activation, or revision may also be an Event when the source explicitly describes
that occurrence and it adds durable knowledge. Recording effective dates does
not establish which rule is currently valid.

## Modeling Economy — Occam's Razor

如无必要，勿增实体。Among representations that preserve the evidence and
relevant business distinctions equally well, prefer the one with fewer
assumptions and unnecessary entities, pages, relations, or abstractions. This
principle applies to modeling constructs generally, not just the `Entity` Type.

- Prefer an existing page or a section within it when that fully captures the
  knowledge. Create a separate page when the item needs its own identity,
  definition, behavior, lifecycle, or independent reference and maintenance.
  A new name or noun alone is insufficient.
- The candidate matrix is a coverage check, not a page-creation quota. Do not
  create a page for every Type merely to populate the matrix; give a
  source-grounded N/A rationale when no standalone item of that Type is needed.
- Fewer assumptions does not mean simpler wording or less work. Do not omit
  evidence, conditions, exceptions, conflicts, or distinct business identities
  to reduce page count. Add structure when an existing representation would
  lose these distinctions; never merge different objects merely for simplicity.
- Simplicity is a methodological preference, not proof that an explanation is
  true. Do not invent a simpler mechanism when the source does not establish it.

## Updating Existing Knowledge

Before changing a page, read the whole page and the existing Raw evidence
relevant to the proposed change.

- Preserve knowledge and Raw links that remain supported. A new source's silence
  is not a reason to remove existing knowledge.
- Keep conclusions for different objects, scenarios, or conditions distinct;
  do not merge them into an unconditional conclusion.
- Mark an earlier conclusion as corrected or superseded only when the sources
  or user explicitly establish that change. Keep the earlier conclusion's
  evidence and enough historical context to distinguish it from its replacement.
- If sources disagree within the same scope and the disagreement cannot be
  resolved, retain both conclusions with their source links and the unresolved
  point in the page. Do not choose by ingest order. Use `Disposition: Disputed`
  in the source's log entry and briefly describe the conflict there; retain the
  normal Coverage table.

## Batch Ingest

When the user supplies multiple URLs, a list of links, several files, or a
directory, run two phases:

1. **Preserve.** Save every source as its raw file first, computing each
   SHA-256 digest at save time (the log entries come later). If one source
   cannot be fetched, skip it, note it, and continue; report the failures at
   the end. With every raw saved up front, an interruption never loses
   sources.
2. **Compile.** Run steps 2–6 for the sources one at a time, finishing each
   source before starting the next. Never compile sources in parallel: each
   candidate matrix's `Reused`/`Updated` judgment depends on the pages the
   previous source just wrote, and concurrent writes would create duplicate
   pages.

Each source gets its own log entry with its SHA-256 and Coverage table.
Finish with a batch summary — per source: disposition and pages added or
updated — and suggest running `wiki-lint`.

Read [templates](references/templates.md) for exact file formats.

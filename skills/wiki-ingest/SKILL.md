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
   relations for other domains.
5. Create/update the pages the matrix calls for, from the matching page template,
   stamping each page `Updated: {today}` (the freshness check requires it). Every
   precise number, date, or quotation must appear verbatim in one or more linked Raw
   files. State derived values with their source components.
6. Update the domain overview and global index. Append the source's full matrix as
   the `### Coverage` table in its log entry. Each non-`N/A` row lists every current
   page grounded in that Raw, including reused pages. If the source adds no
   durable knowledge, retain only the Raw file and log `Disposition: No
   material`; it needs no Coverage table.

Use only relation signatures from `wiki/schema.md`; each relation's source and
target Types must match its signature. Every target must be a relative
Markdown link to an existing typed page. Model time-bounded or qualified claims
as Events; do not create standalone claim pages or duplicate inverse links.

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

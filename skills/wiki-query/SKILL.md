---
name: wiki-query
description: Query a workflow-oriented research wiki by domain, Entity, Workflow, Rule, StateMachine, Event, aliases, and typed relations without writing files. Use when asking about ingested sources. Chinese triggers: 查 wiki, 知识库里有什么, 问知识库, 根据知识库回答.
---

# Query the Wiki

Require `wiki/schema.md`. Read `wiki/index.md`, then search all
`wiki/domains/` pages using query terms, known aliases, and synonyms. Expand
from matching pages through their `## Relations` links when relevant.

Use relation inverses declared in `wiki/schema.md` as query-time traversal only:
an incoming `governs` link can answer a `governed-by` question without writing
a mirror edge. An edge whose Inverse is `None` has no named opposite but is
still traversable from either end — follow incoming `occurred-in` links, for
example, to list the events of an entity or workflow. Prefer the wiki over outside knowledge. Cite answers with project-relative
Markdown links such as `[Order workflow](wiki/domains/commerce/workflows/order-processing.md)`.
Clearly distinguish source-grounded facts from synthesis and report gaps when
the wiki lacks evidence. Ordinary queries do not write files.

Read the relevant page prose as well as its relations: applicability, exceptions,
and effective dates may qualify a conclusion without appearing on an edge.
Preserve conditions that affect the answer. For unresolved conflicts, explain the
disagreement and cite each conclusion's evidence. Distinguish a documented
replacement from an unresolved contradiction; do not combine old and replacement
rules or choose a conclusion by ingest order. Report unknown applicability or
temporal validity as unknown; a page's `Updated` date is a compile date, not proof
that its contents are currently effective.

If the user explicitly asks to save an answer, create a typed page only when it
adds a durable Entity, Workflow, Rule, StateMachine, or Event; otherwise explain that synthesized
answers remain conversational rather than creating an archive page.

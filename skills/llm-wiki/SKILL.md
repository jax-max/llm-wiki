---
name: llm-wiki
description: Navigate a workflow-oriented personal research wiki. Use to choose or coordinate wiki-init, wiki-ingest, wiki-query, or wiki-lint. Chinese triggers: 知识库, 整理成 wiki, 摄入, 查知识库, 检查 wiki.
---

# Workflow-Oriented LLM Wiki

This is a suite of four skills for durable, source-grounded research knowledge.

| Need | Skill |
|---|---|
| Create a new knowledge base | `wiki-init` |
| Add a URL, file, or pasted source | `wiki-ingest` |
| Ask what the wiki knows | `wiki-query` |
| Check evidence and structure | `wiki-lint` |

The scripted skills (`wiki-init`, `wiki-lint`) require Python 3.8+ on PATH —
standard library only, no pip installs. On native Windows the interpreter may
be `python` or `py -3`.

## Model

`raw/` is immutable source evidence. `wiki/` is the compiled knowledge layer.
`wiki/domains/` is the collection of domains; `wiki/domains/<domain>/` is one
bounded knowledge area. Pages are only `Entity`, `Workflow`, `Rule`,
`StateMachine`, or `Event`. Entity pages own business definitions; workflows,
rules, state machines, and domain events capture business behavior. Use `wiki/schema.md` as
the authority for metadata and relation signatures.

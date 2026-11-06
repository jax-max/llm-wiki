---
name: wiki-init
description: Initialize a new workflow-oriented research wiki with typed pages, immutable raw evidence, and schema rules; one project directory is one domain. Use when creating an LLM wiki. Chinese triggers: 新建 wiki, 初始化知识库, 建一个知识库.
---

# Initialize a Workflow-Oriented Wiki

Run the bundled initializer from the intended project root:

```bash
python3 <skill-dir>/scripts/initialize_wiki.py <project-root>
```

On native Windows use `python` or `py -3` if `python3` is not found; if none is
available, ask the user to install Python 3.8+ (e.g.
`winget install Python.Python.3.12`) or use WSL.

It creates, without overwriting existing files:

```text
raw/
wiki/schema.md
wiki/index.md
wiki/overview.md
wiki/log.md
```

The project directory is the domain; name it after the bounded knowledge area
such as `machine-learning/` and the initializer titles `wiki/overview.md` from
it. Create `entities/`, `workflows/`, `rules/`, `state-machines/`, and
`events/` under `wiki/` when the domain first receives knowledge.

If `wiki/` exists without `schema.md`, stop: this skill supports only a wiki
created by `wiki-init`.

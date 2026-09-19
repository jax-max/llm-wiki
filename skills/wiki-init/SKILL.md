---
name: wiki-init
description: Initialize a new workflow-oriented research wiki with domains, typed pages, immutable raw evidence, and schema rules. Use when creating an LLM wiki. Chinese triggers: 新建 wiki, 初始化知识库, 建一个知识库.
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
wiki/log.md
```

`domains/` is the namespace for domains; the initializer creates none. A
concrete domain is a child such as `domains/machine-learning/`; create its
`overview.md`, `entities/`, `workflows/`, `rules/`, `state-machines/`, and
`events/` when it first receives knowledge.

If `wiki/` exists without `schema.md`, stop: this skill supports only a wiki
created by `wiki-init`.

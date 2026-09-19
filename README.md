# llm-wiki

English | [简体中文](README_zh.md)

A reusable Agent Skills suite for a source-grounded, workflow-oriented research
wiki. The model compiles immutable sources into linked Entity, Workflow, Rule,
StateMachine, and Event pages, so knowledge compounds instead of being
rediscovered for every query.

## Why not plain RAG?

Plain RAG (chunk + embedding + similarity retrieval) answers "what is
similar", not "what is true". This project reframes retrieval as compilation:
sources are distilled once into typed, linked, reviewable pages.

| Plain RAG weakness | This project's answer |
|---|---|
| Similarity is not correctness — the nearest chunk may be an old version, a draft, or an exception clause. | `raw/` is immutable evidence; the linter verifies that every number, ISO date, and quotation appears verbatim in the cited Raw file. |
| Chunking severs context — conditions, definitions, tables, and adjacent clauses are split apart, so answers quote out of context. | Knowledge lives in whole typed pages, not fragments; conditions and definitions stay intact. |
| No model of entities and relations — cross-document, multi-hop questions (e.g. customer → contract → product → policy) are unstable. | Five page types plus schema-signed relations; queries expand along `## Relations` links. |
| Terminology and homonyms — one word with many meanings, one entity with many names, and recall gets confused. | Each Entity belongs to one primary domain, carries `Aliases`, and is reused by link instead of copied. |
| No native handling of time, permissions, versions, or precedence ("the policy currently in effect", "visible to this team only"). | Partial, and honest about it: ISO dates must appear verbatim, Event pages record time-bounded occurrences; temporal validity and access control are out of scope for this MVP. |
| Hard to explain and govern — a pile of snippets with no provenance and no conflict resolution. | Every load-bearing fact links back to `raw/`; `wiki/log.md` records dispositions and a coverage matrix; lint enforces both. |
| Maintenance means tuning — chunk size, overlap, embedding, top-k, rerank, endlessly, while business semantics are never captured explicitly. | Business semantics are captured explicitly in reviewable Markdown (schema + pages), not in retriever hyperparameters. |

The trade-off: pay a compilation cost at ingest time to gain determinism at
query time.

## Knowledge model

```text
project/
├── raw/                         # Immutable sources
└── wiki/
    ├── schema.md                # Types, metadata, relation verbs
    ├── index.md
    ├── log.md
    └── domains/                 # Namespace of domains
        └── machine-learning/    # One concrete domain
            ├── overview.md
            ├── entities/
            ├── workflows/
            ├── rules/
            ├── state-machines/
            └── events/
```

`domains/` is a collection; `machine-learning/` is a concrete bounded
knowledge area. An Entity belongs to one primary domain and is linked from
other domains rather than copied. Create a domain only when no existing one
can own the knowledge. Its Overview owns the definition and
boundary of that business object. Workflows describe cross-entity cooperation;
Rules describe decisions, mechanisms, strategies, and algorithms;
StateMachines describe entity lifecycles; Events describe business-significant
domain occurrences (and may be refined into concrete instances when a source
supplies their time and context).

Every typed page declares `Type`, `Raw` links, and the `Updated` compile date
— all three required. `Domain` is derived from its path; `Aliases` and
`Sources` are optional. `Type` is the sole structured classification.
Load-bearing facts remain traceable to immutable files under `raw/`.

The lifecycle: `wiki-init` creates the wiki, `wiki-ingest` compiles sources,
`wiki-query` answers, `wiki-lint` checks.

## Skills

| Skill | Purpose |
|---|---|
| `wiki-init` | Creates an empty workflow-oriented wiki and schema. |
| `wiki-ingest` | Adds sources and compiles Entity, Workflow, Rule, StateMachine, or Event pages. |
| `wiki-query` | Answers from the local wiki without writing. |
| `wiki-lint` | Checks evidence, schema, ordinary links, and relation structure. |

- `wiki-init` is idempotent and refuses to overwrite an existing `wiki/` that has no `schema.md`.
- `wiki-ingest` stores the source verbatim under `raw/`, records the file's SHA-256 in its log entry, plans a candidate matrix (an Added / Updated / Reused / N-A disposition per page type, where every N/A needs a source-grounded reason), then compiles pages in which each exact number, date, and quotation must appear verbatim in the linked Raw file and every created or recompiled page is stamped with the compile-date `Updated`. A source with no new knowledge is kept as Raw with `Disposition: No material`. For a link list or multiple files it runs batch ingest: save every raw first, then compile the sources one at a time — never in parallel.
- `wiki-query` is read-only: it searches `wiki/domains/`, expands along Relations (inverse verbs are query-time traversal hints, never mirrored edges), and separates grounded facts from synthesis, reporting evidence gaps.
- `wiki-lint` runs the evidence and schema checkers, appends one result to `wiki/log.md`, and exits non-zero under `--strict` so findings fail CI. It also recomputes each raw file's SHA-256 against the digest recorded at ingest, flagging modified evidence, and flags pages whose `Updated` predates the latest digest-anchored ingest of their Raw. Auto-fixing is limited to unambiguous link and index repairs.

`skills/` contains five self-contained skills. `skills/llm-wiki/` is a
navigator that routes to the other four; copy `skills/*` into a skills
directory to install the whole suite (see Quick start).

## Example: demo-wiki

`examples/demo-wiki/` compiles one full Chinese article — a Meituan tech-blog
post on domain-driven design in a lottery platform — into the
`lottery-platform` domain: 5 Entity, 1 Workflow, 4 Rule, and 2 Event pages,
all indexed in `wiki/index.md`. Its `state-machines/` directory is deliberately
empty because the source describes no independently verifiable lifecycle
transitions — a live demonstration that an N/A disposition requires an honest,
grounded reason.

Because the source article is in Chinese, you can open any page and check the
verbatim evidence rules against the original text side by side.

```bash
# Read-only checks against the example.
# (Do not run lint_wiki.py on the example — it appends to the example log.)
python3 skills/wiki-lint/scripts/check_evidence.py examples/demo-wiki --strict
python3 skills/wiki-lint/scripts/check_schema.py examples/demo-wiki --strict
```

## Quick start

### Install the skills

Skills are discovered one level deep (`skills/<name>/SKILL.md`), so copy the
contents of `skills/` — not the whole repository — into a skills directory.

```bash
git clone https://github.com/jax-max/llm-wiki
mkdir -p ~/.claude/skills && cp -R llm-wiki/skills/* ~/.claude/skills/    # personal
# or, per project:
mkdir -p <your-project>/.claude/skills && cp -R llm-wiki/skills/* <your-project>/.claude/skills/
```

To stay updatable via `git pull`, symlink each skill instead of copying —
symlinks are supported in skills directories:

```bash
for s in "$(pwd)"/llm-wiki/skills/*; do ln -s "$s" ~/.claude/skills/; done
```

The scripted skills (`wiki-init`, `wiki-lint`) require Python 3.8+ on PATH —
standard library only, no pip installs. macOS and Linux ship it. On native
Windows, install Python from python.org or via
`winget install Python.Python.3.12` and use `python` or `py -3` instead of
`python3` (or simply use WSL). Claude Code on native Windows runs its shell
through Git for Windows, whose bash environment provides `sha256sum` for
ingest-time hashing.

### Use

Then, in an agent that supports skills (e.g. Claude Code), drive them in
natural language:

- "Create a wiki in this project" — `wiki-init` scaffolds it.
- "Ingest this article: <url>" — `wiki-ingest` compiles the source into typed pages.
- "What does the wiki know about …?" — `wiki-query` answers from the local wiki only.
- "Check the wiki" — `wiki-lint` verifies evidence and structure.

### Without an agent

The scripts also run directly from a clone of this repository:

```bash
# 1. Create an empty wiki in your project
python3 skills/wiki-init/scripts/initialize_wiki.py /path/to/your-project

# 2. Health-check your wiki (appends one lint entry to its log)
python3 skills/wiki-lint/scripts/lint_wiki.py /path/to/your-project --strict
```

## Design boundaries (Ontology MVP)

`wiki/schema.md` is deliberately small and executable: it contains page types,
required metadata, and a relation-signature table. The linter verifies Type and
directory compatibility, relation subject/object compatibility, specialized
page structure, links, and evidence. Inverse names are query-time traversal
hints, not duplicated edges.

This is not RDF/OWL or a graph database. Use an `Event` page for a meaningful
business occurrence; capture a concrete instance when a claim needs time,
participants, or other context. Ordinary relations are durable and
unqualified. Each new ingest records a Page-Type
coverage matrix in `wiki/log.md`; schema lint verifies its links, dispositions,
and Raw-page coverage. Run either checker with `--strict` to make findings
fail CI.

There is deliberately no model for versioning, permissions, or temporal
validity (see the fifth row of the table above).

## Development

```bash
python3 -m unittest discover -s tests -v
```

Two suites cover the evidence checker and the ontology tools. The project
uses only the Python standard library — no third-party dependencies.

## Acknowledgements

Inspired by [Karpathy's LLM Wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

> "The LLM writes and maintains the wiki; the human reads and asks questions."

This is an unofficial community implementation of that workflow.

## License

[MIT](LICENSE)

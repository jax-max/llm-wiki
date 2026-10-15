# llm-wiki

English | [简体中文](README_zh.md)

A reusable Agent Skills suite for a source-grounded, workflow-oriented research
wiki. The model compiles immutable sources into linked Entity, Workflow, Rule,
StateMachine, and Event pages, so knowledge compounds instead of being
rediscovered for every query.

## Ask your wiki in the browser

The independent [`web/` app](web/README.md) lets you ask questions, follow up,
and check the evidence behind an answer. It uses the repository's `wiki-query`
Skill to search one local wiki and follow its knowledge relationships.

- Stream answers as they are generated; stop and retry when needed.
- Bilingual interface (中文/English) that follows the browser language and switches from the header.
- Follow progress by source title, such as “正在阅读《抽奖尝试计数》”, without file paths or tool names.
- Open citations, read original sources, and return through related pages in a source panel that also works on narrow screens.
- Start a new conversation at any time after generation stops. Conversations stay in memory and are not saved across page refreshes.

### Start locally

Requires Node.js **22.19 or newer**. Run these commands from the **repository root**:

```sh
npm --prefix web ci
cp -n web/.env.example web/.env
# Fill in LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in web/.env.
npm --prefix web run dev
```

The copy command preserves an existing `.env`. If it is already configured,
just run `npm --prefix web run dev`. Open **http://127.0.0.1:5174**.
There is no root `package.json`; plain `npm run dev` must be run inside `web/`.

Configuration lives in `web/.env`; relative paths are resolved from `web/`.
The default wiki is `examples/demo-wiki`. Set `WIKI_ROOT` to use your own wiki.
Choose `anthropic-messages` with an Anthropic host root (without `/v1`), or
`openai-completions` with the provider's API base URL (commonly ending in `/v1`).
Credentials stay on the server. `PORT=3002` fixes the backend/production port;
`WEB_PORT=5174` fixes the development page port. Set both in `web/.env`.
An occupied port causes an error instead of an automatic port change.
Restart after changing the configuration.

Try “用户参与抽奖需要满足什么条件？”, then “这些规则约束哪些流程？”,
or ask “抽奖活动有哪些状态？” and follow up with “这个结论的原始依据是什么？”.
The demo lifecycle is an explicit teaching supplement; answers should identify
that source rather than attributing it to the original technical article.

The app runs on this computer and reads the wiki without editing it. Knowledge
ingestion and maintenance continue through the existing Skills. Model requests
send the question and selected evidence to the configured provider. See the
[Web guide](web/README.md) for configuration, limits and API details.

### Build and validate

The user runs the following commands from the repository root:

```sh
npm --prefix web run test:web
npm --prefix web run test:client
npm --prefix web run build
npm --prefix web start
```

The production app is served at **http://127.0.0.1:3002**. AI runs only the core
unit tests (`npm --prefix web test`); Web, frontend, browser and live-model
acceptance is user-operated. See [test cases and expected results](web/TESTING.md)
and [collaboration rules](CLAUDE.md). Automated fixtures do not establish real
model connection or answer quality; those require user acceptance.

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
supplies their time and context). StateMachines and Workflows both order
behavior: a StateMachine must anchor to one entity and advance by trigger and
guard, while a process that names no entity states is a Workflow even when its
order is fixed.

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

`examples/demo-wiki/` demonstrates all five page types in the
`lottery-platform` domain: 5 Entity, 1 Workflow, 4 Rule, 1 StateMachine, and
2 Event pages, all indexed in `wiki/index.md`.

The full Chinese Meituan article on domain-driven design provides the business
objects, participation workflow, rules, and the participation and award-issuance
behaviors modeled as Event types. These Event pages illustrate business
occurrences and their context; they do not claim an event-message implementation
or a real dated transaction. `sendAward` is a method and `SendResult` is output,
not event aliases.

The article does not define lifecycle states or transitions. A separate,
explicitly fictional teaching specification in `raw/demo-spec/` supplies the
activity lifecycle used by the StateMachine example. Its page identifies that
source so readers can distinguish the teaching assumptions from the article.
Open the Chinese pages alongside their linked Raw sources to inspect the evidence.

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
business occurrence, as an event type or a concrete instance grounded in the
source. Conditions, exceptions, and source-stated effective dates stay with the
Entity, Rule, Workflow, or StateMachine they qualify; a date or condition alone
does not make an Event. A rule's publication, activation, or revision can be an
Event when the source explicitly describes that occurrence and it adds durable
knowledge. Ordinary relations are durable and unqualified; express conditional
relationships in the owning page's prose with links instead of asserting an
unconditional edge. Each new ingest records a Page-Type
coverage matrix in `wiki/log.md`; schema lint verifies its links, dispositions,
and Raw-page coverage. Run either checker with `--strict` to make findings
fail CI.

When updating a page, read its existing content and the relevant old Raw
evidence. Preserve supported knowledge and its source links even if a new source
does not mention it. Keep different scopes distinct; mark a conclusion as
corrected or superseded only with explicit source or user support, retaining
the necessary history and evidence. Unresolved same-scope contradictions remain
side by side with source links and an explanation, and the ingest log uses
`Disposition: Disputed` with a brief conflict note. Ingest order does not decide
which conclusion is correct. Queries preserve material conditions, explain
unresolved conflicts with their evidence, and report unknown applicability or
temporal validity as unknown.

There is deliberately no versioning system, access control, or automatic
temporal-validity reasoning (see the fifth row of the table above). Source-stated
effective dates can be recorded in prose. `Updated` is a compile date, not a
business effective date. The checkers validate structure, literal evidence,
integrity, and compile freshness; passing lint does not prove semantic
consistency, correct merging, or current business validity.

For an existing wiki, update only the corresponding schema guidance to adopt
these semantics; no format migration or automatic page reclassification is needed.

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

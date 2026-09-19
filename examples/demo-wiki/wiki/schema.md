# Wiki Schema

## Page Types

| Type | Directory | Meaning |
|---|---|---|
| Entity | `entities` | An identifiable instance: person, organization, product, place, or object. |
| Workflow | `workflows` | An ordered collaboration across entities, rules, and state machines. |
| Rule | `rules` | A business rule, mechanism, strategy, or algorithm. |
| StateMachine | `state-machines` | The states and lifecycle transitions of an entity. |
| Event | `events` | A time-bounded occurrence. |

## Required Metadata

`Type`, `Raw`, and `Updated` are required blockquote fields on every typed
page. `Raw` must contain one or more links that resolve under `raw/`. Domain
is inferred from `domains/<domain>/...`; `Aliases` and `Sources` are optional.
`Updated` is the page's last compile date, written at every create or
recompile, and must not predate the latest ingest of any linked Raw — the
evidence checker enforces this against ingest dates anchored by SHA-256
digests. Type is the only structured classification.

## Relation Signatures

| Verb | Subject Type | Object Type | Inverse |
|---|---|---|---|
| part-of | Any | Any | has-part |
| has-part | Any | Any | part-of |
| uses | Workflow | Entity, Rule, StateMachine | None |
| governs | Rule | Entity, Workflow | governed-by |
| governed-by | Entity, Workflow | Rule | governs |
| has-state-machine | Entity | StateMachine | state-machine-of |
| state-machine-of | StateMachine | Entity | has-state-machine |
| related-to | Any | Any | related-to |
| occurred-in | Event | Entity | None |

Relations belong in `## Relations` as `- verb: [Target](relative-path.md)`.
Use `## Steps` (an ordered list) on Workflow pages, `## Rule` on Rule pages,
and `## States` plus `## Transitions` tables on StateMachine pages. Write
time-bounded facts as Event pages; relations themselves are unqualified,
durable statements. The `Inverse` column is query-time help only: do not
duplicate reverse links in pages.

# Wiki Schema

## Page Types

| Type | Directory | Meaning |
|---|---|---|
| Entity | `entities` | An identifiable instance: person, organization, product, place, or object. |
| Workflow | `workflows` | An ordered collaboration across entities, rules, and state machines. |
| Rule | `rules` | A business rule, mechanism, strategy, or algorithm. |
| StateMachine | `state-machines` | The states and lifecycle transitions of an entity. |
| Event | `events` | A business-significant occurrence, modeled as an event type or a source-grounded instance. |

StateMachine and Workflow both order behavior. Choose StateMachine when the
subject is one entity whose named states advance by trigger and guard — it must
anchor to a single Entity via `state-machine-of`. Choose Workflow when
participants collaborate in ordered steps; a process that names no entity
states is a Workflow even when its order is fixed.

Applicability, exceptions, and source-stated effective dates belong in the prose
of the Entity, Rule, Workflow, or StateMachine they qualify; they do not by
themselves make an Event. A rule's publication, activation, or revision may be
an Event when the source explicitly describes a meaningful business occurrence.
Recording effective dates does not provide automatic temporal-validity reasoning.

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
| uses | Workflow | Entity, Rule, StateMachine, Workflow | None |
| governs | Rule | Entity, Workflow, StateMachine | governed-by |
| governed-by | Entity, Workflow, StateMachine | Rule | governs |
| has-state-machine | Entity | StateMachine | state-machine-of |
| state-machine-of | StateMachine | Entity | has-state-machine |
| related-to | Any | Any | related-to |
| occurred-in | Event | Entity, Workflow | None |

Relations belong in `## Relations` as `- verb: [Target](relative-path.md)`.
Use `## Steps` (an ordered list) on Workflow pages, `## Rule` on Rule pages,
and `## States` plus `## Transitions` tables on StateMachine pages. Relations
are unqualified, durable statements. Describe conditional relationships in the
owning page's prose with links instead of asserting an unconditional edge.
The `Inverse` column is query-time help only: do not
duplicate reverse links in pages. An inverse of `None` means the verb has no
named opposite, not that the edge is one-way to queries: traverse it from
either end.

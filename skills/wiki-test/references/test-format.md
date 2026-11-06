# Executable knowledge tests (v1)

Assets live at project-root `wiki-tests/`, outside the compiled `wiki/`. All paths
are project-relative. JSON avoids dependencies. Run `check <root>` to validate
without generating assets or reports. Local assertions never execute arbitrary Python, eval, shell or plugins. Semantic
cases call Jev through the separate runtime adapter.

## Structured facts (optional local checks)

Place a fenced block beside the rule's prose, in a page under `wiki/domains/`:

````markdown
```wiki-rule
{
  "id": "returns",
  "critical": true,
  "facts": {"window_days": 7, "excluded": ["custom"]}
}
```
````

This is an illustrative policy, not a statement about the demo lottery domain.
IDs and fact keys use ASCII letters, digits, `_` or `-`. IDs are globally unique.
Rule ID is the stable block anchor; paths and line locations are discovered rather
than maintained twice. One block is one registered rule, with related facts.
`critical` defaults to false. Wiki text and bindings are the only knowledge basis.

Represent sets and ordered steps as arrays, numeric constraints as numbers, and
state transitions as arrays of tuples. Ordered equality tests a complete sequence;
membership tests an allowed transition. Arbitrary prose remains prose.

## Test set

`suite.json` contains `version: 1`, optional `model` (default `jev-latest`),
`knowledge: []`, `cases: []`, and `mutations: []`. Existing v1 cases without `kind`
retain deterministic behavior. New cases explicitly use `semantic` or `deterministic`.

Example approved case (derive its expected answer from the bound Wiki):

```json
{
  "id": "return-day-five",
  "kind": "deterministic",
  "status": "approved",
  "question": "普通用户签收五天，商品非定制，满足其他条件，可以申请退货。",
  "inputs": {"days": 5, "category": "ordinary"},
  "expected": true,
  "targets": ["returns"],
  "context_rules": [],
  "assertion": {
    "op": "all",
    "args": [
      {"op": "le", "args": [{"input": "days"}, {"fact": "returns.window_days"}]},
      {"op": "not", "args": [
        {"op": "in", "args": [{"input": "category"}, {"fact": "returns.excluded"}]}
      ]}
    ]
  },
  "rationale": "绑定 Wiki 规定七日内可退且排除定制商品。五日且非定制符合条件，防止期限被缩短。"
}
```

Leaves are exactly one of `{"literal": value}`, `{"fact": "ID.key"}` or
`{"input": "name"}`. Operators contain exactly `op` and `args`:

| Operator | Operands / behavior |
|---|---|
| `eq`, `ne` | Two values; type-sensitive equality (true is not 1) |
| `lt`, `le`, `gt`, `ge` | Two numbers, excluding booleans |
| `in` | Value followed by array |
| `contains` | Array followed by value |
| `all`, `any` | One or more booleans, all evaluated |
| `not` | Exactly one boolean |

Assertions must return bool. All referenced rule IDs must be listed exactly once
in `targets` or `context_rules`. Targets count for coverage; context does not.
Cross-page assertions simply reference multiple rules. No separate execution mode.
Literal expected values are independent specifications; changing Wiki never changes
them. Scenario logic is a reviewed test specification, not a duplicate production
rule engine: v1 checks structured facts and their relationships, not arbitrary
natural-language business procedures.

`generate` adds one fact-equality draft per new fact and records `generated_facts`
to avoid regenerating it. Such snapshots detect value regressions but are not a
substitute for boundary and cross-page cases. Existing cases, answers and statuses
are preserved. Removal/rename needs explicit binding migration. Keep the generation
report for review; `inventory.json` is the last scan, not an approval baseline.

## Fact mutations

```json
{
  "id": "shorten-return-window",
  "status": "approved",
  "fact": "returns.window_days",
  "before": 7,
  "after": 3,
  "cases": ["return-day-five"],
  "rationale": "五日超过修改后的三日，应使原题从真变假。"
}
```

The runner replaces one fact in memory, without changing files or accumulating
mutations. `before` must match the runtime baseline; stale mutations fail, without
preventing baseline cases from running. `after` must differ and retain the JSON
type. Case references must target the mutated rule. Approved mutations may only
reference approved cases. Candidate generation flips booleans, increments numbers,
or removes the last array member; review their relevance before approval.

At least one designated case with a passing baseline must flip for a mutation
check to pass. Individual pair results are also retained. A baseline failure is
never a detection. Mutations with no passing baseline or stale preconditions are
reported as failed and excluded from the detection-rate denominator. A zero
denominator is N/A, not 100%. Rule coverage still measures registered knowledge,
not the entire domain. Pages without blocks are listed separately.

## Versioning and limitations

Track the test set, inventory and page bindings; add `/wiki-tests/reports/` to the project's
ignore rules. Reports prioritize failed scenarios, expected/actual results and Wiki locations,
then mutation failures and auxiliary inventory statistics. JSON includes baseline
outcomes, mutation pair outcomes, reverse bindings, and test-set/rule content hashes. They support comparing runs; use the
version-controlled source files to reproduce historical inputs.

Keep executable blocks and prose consistent during authoring. Local assertions
check structured facts, not prose semantics; a Chinese question must accurately
describe its assertion. Review only against Wiki. Never read Raw or follow its
links at any stage. Semantic cases explicitly test current prose using Jev.
The removed `sources` field is rejected, not retained or migrated by the runner.


## Semantic knowledge and cases

Ordinary prose does not need a `wiki-rule` block. Register one independently testable
knowledge item in `suite.json.knowledge`, binding a line range of the page — the
Wiki page itself stays markup-free:

```json
{"id":"return-policy","page":"wiki/domains/shop/rules/returns.md","lines":[9,9],"anchors":["普通用户签收七日内可申请退货，定制商品除外。","普通用户签收七日内可申请退货，定制商品除外。"],"critical":true}
```

`lines` is the 1-based inclusive `[first, last]` row range of the bound prose.
`anchors` are the exact first and last lines; execution fails on a mismatch
(stale binding) instead of silently testing the wrong rows. `generate`
relocates drifted lines automatically when both anchors still match uniquely,
and reports unresolvable bindings in `authoring.json.missing_bindings`. Anchor
lines must each be unique within the page, or repair becomes ambiguous. Omit
`lines` to bind the entire page (coarser coverage). IDs must not collide with
structured rule IDs. Avoid overlapping ranges or duplicating the same rule in
multiple bound inputs. Use `rationale` to explain what the bound Wiki implies and which error the case guards.

A semantic case has no `assertion` and does not need `inputs`; the scenario belongs
in its question:

```json
{"id":"return-day-five-semantic","kind":"semantic","status":"approved","question":"普通用户签收五天，商品非定制，满足其他条件，可以申请退货。","expected":true,"targets":["return-policy"],"context_rules":[],"rationale":"五日未超过七日且不属于排除品类。"}
```

Cross-page cases list multiple target/context IDs; the runner assembles their
current text. Each request is isolated. `expected`, `rationale` and local assertions are never supplied to Jev. `question` is part of the instructions,
current Wiki text is the `state`. The response's `answers.judgment.noul >= 0.5`
is true. Requests and actual model identifiers are retained in JSON reports.

## Core logic and quality findings

Select branches, prerequisites, execution order, exceptions, responsibility
boundaries and cross-page dependencies that affect concrete reader decisions.
A case has one main conclusion and guards a distinct failure mode. There is no
fixed number of cases per core. A second wording of the same scenario does not
create another branch. Do not author tests just for field lists, relation edges
or page classifications.

For example, pool matching has separate scenarios for city and score both present
(city takes priority) and city absent (score fallback). Bind all Wiki context
needed to qualify the conclusion. In `rationale`, state the Wiki derivation and
what wrong decision this case prevents. Do not infer false from missing evidence.

Maintain `cores.json` as an agent-authored mapping with a `cores` array. Each entry
has `core` (the behavior), `cases` (case IDs), `mutations` (mutation IDs), and
optionally `unresolved` (finding IDs from the quality report). Group by behavior,
not by page. This mapping is review material, not a coverage percentage or a
separate executable rule engine.

Write `wiki-tests/quality.md` after authoring/review. Include the reviewed Wiki scope
and one entry per unresolved core scenario: stable finding ID, scenario, Wiki
path and line range(s), missing condition/ambiguity/conflicting statements,
decision impact, and what the Wiki must clarify. Distinguish documented unknowns
from contradictions. Do not create approved boolean cases for unresolved answers.
If no issues were found, state that within the reviewed scope; do not infer this
from passing tests. The script neither writes nor overwrites this semantic review.

## Text mutations

```json
{"id":"shorten-prose-window","kind":"text","status":"approved","target":"return-policy","before":"七日内","after":"三日内","cases":["return-day-five-semantic"],"rationale":"五日超过三日，指定题目的答案应翻转。"}
```

Replace exactly one occurrence inside the bound text, independently in memory.
Both strings must be nonempty. Missing/ambiguous matches fail as stale mutations.
Only semantic cases may bind text mutations; fact mutations bind local cases.
Review semantic validity before approval: removing all evidence is not a valid
answer-flipping mutation. Keep the entire context internally consistent; replace
a complete passage if the rule is repeated. Do not mutate the question or expected
answer. Equivalent rewrites are acceptance scenarios, not another asset type.

## Execution and coverage

Run with `TYPESAFE_API_KEY` in the environment. The adapter uses the official
`POST https://api.typesafe.ai/v1/systemone` endpoint with a `noul` question.
See https://docs.typesafe.ai/introduction/quickstart for the API definition.
No SDK dependency, no semantic fallback to local matching.

Reports distinguish knowledge with semantic cases (`semantic_rules`), structured
fact references (`deterministic_facts`), and any-test bindings (`rules`, inventory
only). A single checked field does not mean other facts or the prose were verified.
The `gold` statistic counts passing approved cases. All statistics count approved cases only; context-only dependencies
are not coverage targets. Individual mutation results retain their case pairs.

The `generate` helper creates draft snapshots and `reports/authoring.json`, not
natural-language scenario tests. The Skill must finish semantic authoring and
Wiki-only review and its quality findings before reporting generation complete. This division deliberately
keeps bookkeeping in scripts and interpretation in the Agent.


## Integrity and incomplete runs

Semantic bindings used together must not overlap within a page: a full-page binding
and a contained range would duplicate the original text during mutation. Validation
rejects this; use distinct ranges or one shared binding. Structured-rule inventory
hashes include the page prose so prose-only changes enter the review queue.

Generation reports missing pages, stale line bindings and unresolved anchors in
`authoring.json.missing_bindings`, retains their cases and expected answers, and
allows the author to repair bindings. Execution remains strict and rejects them.

Starting `run` marks the latest report `completed: false` before validation or
network work. Only a finished run writes `completed: true`; an interruption cannot
leave a previous passing report looking current. This is run metadata, not another
question-answer type. Reports list missing semantic tests and unchecked fields
as well as coverage fractions.

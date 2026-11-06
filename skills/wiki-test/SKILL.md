---
name: wiki-test
description: >-
  Check Wiki core logic with scenario tests, report gaps and contradictions,
  and run semantic judgments, local assertions and mutations for regression.
  Chinese triggers: 生成测试集, 执行知识测试, wiki-test, 检查知识质量.
---

# Test Wiki Core Logic

Two operations: **generate and review tests**, then **run tests**. Protect core
branches, preconditions, order, exceptions, responsibility boundaries and cross-page
consistency. Page or sentence coverage is not a goal.

## Wiki-only boundary

**Throughout generation, review, expected-answer derivation, mutation design and
execution, use only `wiki/` as knowledge. Never read `raw/` or follow source links,
including links embedded in Wiki pages. Do not consult external knowledge to fill
Wiki gaps.** Test assets and reports may be read/written for bookkeeping; they are
not additional knowledge. Do not invoke evidence-checking tools that read Raw.

Use Wiki bindings and `rationale` for justification. There are no source fields or
source-review steps. If Wiki cannot settle a core scenario, report the missing
condition, ambiguity or conflict instead of inventing an expected answer.

Python 3.8+, standard library only. Semantic execution requires network access and
`TYPESAFE_API_KEY`; structural checks and local assertions do not.

## Generate and review

Read [the test format](references/test-format.md). Require `wiki/schema.md`.

### Choose the reasoning path

Choose per topic; a Wiki may contain both modes. Use `application` only when the
user supplies a concrete use or the Wiki explicitly declares one. Record that
task and where it was stated. Otherwise default to `qa`: do not demand a use case
or invent one. A page describing a workflow does not by itself promise to be a
complete implementation guide. User task context sets scope, not knowledge facts.

| Mode | Derivation of a core | Admission test |
|---|---|---|
| `application` | Stated task → workflow → key decision → required rules → scenarios | Removing or reversing the rule blocks the task or changes its decision/result. |
| `qa` | Wiki topic → principal question → main conclusion → conditions, exceptions and boundaries → scenarios | Removing or reversing the information makes the principal answer wrong, overgeneralized or indeterminate. |

For QA, derive principal questions from titles, overviews and substantive rules,
not from every sentence. Merge overlapping topics across pages. A heading alone
does not make every detail important. If a topic has no substantive conclusion,
do not force a logical core. For either mode, keep the chain question → core →
cases in `cores.json`, with the located Wiki basis and concrete failure recorded
in each case's bindings and `rationale`. Reject candidates without that chain;
merge cases that protect the same distinction. These are documented priorities,
not claims about unknown user demand or complete domain coverage.

Missing information has different implications: a required decision that blocks
an explicit task is an application gap. In QA, an unsupported follow-up is an
answer boundary, not automatically a defect. Call it a core gap only if the
principal question itself cannot be answered as the Wiki presents it. Conflicting
answers in the same scope are quality issues in either mode. Record relevant
boundaries without inventing answers or treating them as failed tests.

### Author and review cases

1. Run `python3 <skill-dir>/scripts/wiki_test.py generate <project-root>`.
   Read `reports/authoring.json` and existing tests. The script inventories changes,
   repairs uniquely relocatable bindings, lists affected knowledge/cases/cores/mutations
   (targets and `context_rules` both count as dependencies) and keeps a persistent
   review queue: reruns never drop unfinished items, changed content returns as a new
   pending item, and wording changes outside a binding still queue that page for review.
   It creates local snapshot drafts; it does not author semantic tests or certify Wiki
   quality. Work only the pending items and their dependencies; do not rewrite
   unrelated cases, cores or findings. After semantic review, mark the item `done`
   with the current `scan_version` — a passing run never marks review done.
2. Read current Wiki pages and relevant Wiki dependencies. Derive candidate cores
   using the selected reasoning path above; do not start by enumerating questions.
   Bind relevant text through `suite.json.knowledge`; ordinary prose stays prose.
3. Author realistic scenarios distinguishing branches, boundaries, prerequisites,
   order and cross-page constraints. Each case checks one main conclusion. In its
   `rationale`, explain the derivation from bound Wiki and the distinct error it
   guards. Derive true and false answers from explicit rules, not from silence.
   No per-page or per-core question quota. Merge tests guarding the same error.
   Field lists, relation edges and page classifications get no standalone tests
   merely for coverage. Use local assertions only where computation suffices.
4. Review the complete relevant Wiki context before approving. Conditions belong
   in the scenario, but do not put the tested rule or its answer into the question.
   An exception qualifies a general rule; it is not automatically a conflict.
   If a core scenario remains unresolved, put it in `wiki-tests/quality.md`, not in
   approved cases. A finding must identify a scenario, Wiki location(s), the gap,
   ambiguity or conflicting conclusions, and its decision/answer impact. Classify
   it as a core gap, conflict or answer boundary under the selected mode. Do not flag
   arbitrary missing detail unrelated to core logic. Distinguish an explicitly
   documented unknown from contradictory rules.
5. Add reviewed mutations representing plausible core errors. Mutated bound text
   must be internally consistent: when a rule is repeated, replace the complete
   relevant passage consistently, not only one occurrence. Check the entire
   context sent to each designated case. Missing evidence alone is not a valid
   answer-flipping mutation. Use equivalent rewrites as acceptance scenarios,
   without introducing another test asset format.
6. Update `wiki-tests/cores.json` (mode + principal question + core → guarded
   case IDs; `task` for application mode; `unresolved` pointing at quality-finding
   IDs). Do not duplicate maintenance: the Wiki basis and the guarded failure live
   in each case's bindings and `rationale`, and mutation ownership is derived from
   `suite.json` case references, not kept a second time. Every approved case
   belongs to a core; unresolved scenarios point to the quality findings instead of
   invented cases. Preserve confirmed answers across edits. Change an answer only
   when an explicit Wiki rule change justifies it, recording that rationale; never
   update answers merely to make the suite pass.
7. Run `check`, regenerate the inventory, and finish `wiki-tests/quality.md` with
   the current findings, including "none found" if appropriate; keep stable finding
   IDs and drop duplicated long review narratives — scope and scan version are
   recorded in `reports/authoring.json`. Report authored cases, unresolved
   scenarios and remaining drafts. A script-only queue or passing baseline is not
   a completed quality review.

## Execute

```sh
# Daily regression: all approved baseline cases, no mutations.
python3 <skill-dir>/scripts/wiki_test.py run <project-root>

# Verify test effectiveness: baseline plus approved mutations.
python3 <skill-dir>/scripts/wiki_test.py run <project-root> --verify-tests

# Targeted verification of added/edited cases (repeatable).
python3 <skill-dir>/scripts/wiki_test.py run <project-root> --verify-tests --case <id>
```

Trigger rules: after a Wiki update, run the regression. After adding or editing
cases, or a substantive change to related rules, verify only the affected cases.
Do not re-verify the whole suite on every run, and do not redesign the suite per
execution. Equivalent rewrites remain an acceptance method (see the acceptance
checks), not a CLI mode or asset format.

The default run executes approved baselines only; stale mutation text cannot fail
it. `--verify-tests` additionally applies approved mutations in isolated in-memory
copies and checks that designated cases flip. `--case` requires `--verify-tests`
and rejects unknown or unapproved IDs; targeted verification runs the selected
baselines plus the related mutations' checks on those cases, and unselected cases
never decide a mutation result. Mutation detection still requires a passing
baseline. Reports state the scope — mutations not run, failed, full or partial
verification — and never present a partial pass as a full one.

Jev judges current bound Wiki text plus the question; expected answers, rationales
and cached summaries are never supplied. Computable facts use local assertions.
No fallback model, skipped semantic cases or retries to obtain a desired result.
A missing key stops semantic execution.

`reports/latest.json` and `latest.md` show failed scenarios, expected/actual answers,
Wiki locations, the run scope and mutation failures before auxiliary inventory
statistics. The agent-authored `quality.md` contains gaps/conflicts; a passing run
does not close those findings. The script never claims to discover semantic gaps
by itself.

Jev `noul >= 0.5` means true. Record probability, actual model, prompt version and
request. In verification runs, stale mutations fail and are excluded from the
detection-rate denominator; zero denominator is N/A. Starting a run marks the
latest report incomplete so old success cannot masquerade as a current result.
Exit 0: passed; 1: case/mutation failed; 2: could not complete. `check` validates
all asset structure offline and makes no model calls.

Version suite, core mapping and inventory. Reports may be ignored or retained as
review/CI artifacts. Keep semantic bindings and deterministic fact references
separate in statistics: neither proves all prose was checked. Unregistered pages
are review inventory, not a requirement to invent tests for each page.

See [acceptance checks](references/acceptance.md) for live judgments, equivalent
rewrites and quality-authoring scenarios. Respect repository rules about who may
run model/API acceptance.

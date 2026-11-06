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

1. Run `python3 <skill-dir>/scripts/wiki_test.py generate <project-root>`.
   Read `reports/authoring.json` and existing tests. The script inventories changes,
   repairs uniquely relocatable bindings and creates local snapshot drafts; it does
   not author semantic tests or certify Wiki quality.
2. Read current Wiki pages and relevant Wiki dependencies. Identify core logic by
   asking: **what concrete wrong decision could a reader make if this changed?**
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
   If a core scenario remains unresolved, put it in `reports/quality.md`, not in
   approved cases. A finding must identify a scenario, Wiki location(s), the gap,
   ambiguity or conflicting conclusions, and its decision impact. Do not flag
   arbitrary missing detail unrelated to core logic. Distinguish an explicitly
   documented unknown from contradictory rules.
5. Add reviewed mutations representing plausible core errors. Mutated bound text
   must be internally consistent: when a rule is repeated, replace the complete
   relevant passage consistently, not only one occurrence. Check the entire
   context sent to each designated case. Missing evidence alone is not a valid
   answer-flipping mutation. Use equivalent rewrites as acceptance scenarios,
   without introducing another test asset format.
6. Update `wiki-tests/cores.json` (core → guarded scenarios/case IDs → mutations).
   Every approved case belongs to a core; unresolved scenarios point to the quality
   findings. Preserve confirmed answers across edits. Change an answer only when
   an explicit Wiki rule change justifies it, recording that rationale; never
   update answers merely to make the suite pass.
7. Run `check`, regenerate the inventory, and finish `reports/quality.md` with the
   reviewed scope and current findings, including "none found" if appropriate.
   Report authored cases, unresolved scenarios and remaining drafts. A script-only
   queue or passing baseline is not a completed quality review.

## Execute

```sh
python3 <skill-dir>/scripts/wiki_test.py run <project-root>
```

Run all approved cases and mutations. Jev judges current bound Wiki text plus the
question; expected answers, rationales and cached summaries are never supplied.
Computable facts use local assertions. Mutations use isolated in-memory copies.
No fallback model, skipped semantic cases or retries to obtain a desired result.
A missing key stops semantic execution.

`reports/latest.json` and `latest.md` show failed scenarios, expected/actual answers,
Wiki locations and mutation failures before auxiliary inventory statistics. The
agent-authored `quality.md` contains gaps/conflicts; a passing run does not close
those findings. The script never claims to discover semantic gaps by itself.

Jev `noul >= 0.5` means true. Record probability, actual model, prompt version and
request. Mutation detection requires a passing baseline. Stale mutations fail
and are excluded from the detection-rate denominator; zero denominator is N/A.
Starting a run marks the latest report incomplete so old success cannot masquerade
as a current result. Exit 0: passed; 1: case/mutation failed; 2: could not complete.
`check` is read-only and makes no model calls.

Version suite, core mapping and inventory. Reports may be ignored or retained as
review/CI artifacts. Keep semantic bindings and deterministic fact references
separate in statistics: neither proves all prose was checked. Unregistered pages
are review inventory, not a requirement to invent tests for each page.

See [acceptance checks](references/acceptance.md) for live judgments, equivalent
rewrites and quality-authoring scenarios. Respect repository rules about who may
run model/API acceptance.

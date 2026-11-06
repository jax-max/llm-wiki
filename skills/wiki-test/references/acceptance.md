# Acceptance: Wiki core logic and regression

Core unit tests use injected judgments to verify orchestration, path boundaries
and reporting. They do **not** establish Jev accuracy. Under this repository's
CLAUDE.md, the user runs live-model acceptance. Do not claim it passed without
actual results. Never read Raw or follow source links during any acceptance step.

## Structural checks

```sh
python3 skills/wiki-test/scripts/wiki_test.py check skills/wiki-test/assets/semantic-example
python3 skills/wiki-test/scripts/wiki_test.py check examples/demo-wiki
python3 -m unittest discover -s tests -p test_wiki_test.py -v
```

The fictional semantic fixture has only Wiki knowledge: an explicit return window,
an over-limit denial and a custom-goods exception. Three approved cases cover
allowed, late and exception scenarios; two mutations reverse rules consistently.
The demo maps its cases to behavioral cores in `wiki-tests/cores.json`.

## Live baseline and mutations — user executes

With `TYPESAFE_API_KEY` set:

```sh
python3 skills/wiki-test/scripts/wiki_test.py run skills/wiki-test/assets/semantic-example
python3 skills/wiki-test/scripts/wiki_test.py run examples/demo-wiki
```

Expect baseline cases and valid mutations to pass. Inspect recorded requests:
only current bound Wiki and the question enter the judgment; expected answers,
rationales and summaries must not. Reports record actual model and probabilities.
The demo's city-priority mutation must make `city-first` false. Its risk-order
mutation must make `risk-before-admission` true; inspect the mutated request to
confirm both occurrences of the order were changed consistently.

On temporary copies, retaining the original case questions and expected answers:

1. Change **both** `7日` occurrences in the window rule to `3日`. Refresh that
   binding's anchors, then run. `within` fails; the old mutation is stale, not a
   successful detection.
2. Restore the fixture. Change `不支持` to `支持` on the exclusion page, refresh
   its anchors and run. `custom` fails.
3. Restore the fixture. Rewrite the window as
   `普通用户可在签收后的7日内申请退货；超过7日则不允许。定制商品适用单独的例外规则。`
   and refresh its anchors. The three **baseline** answers must remain unchanged.
   Update the text mutation's matching passage to preserve the same 7→3 semantic
   change before requiring the entire run to pass; stale mutation text is an asset
   issue, not a semantic rewrite failure.
4. On a demo copy, rewrite the city branch as
   `有城市信息则优先按城市选池；仅在缺少城市信息时使用得分。` Update its anchor
   and mutation match. `city-first`, `score-fallback` and `selection-cross-page`
   keep their baseline answers. Likewise rewrite both risk-order sentences using
   equivalent wording; `risk-before-admission` remains false.
5. Remove the API key: execution must stop, not return local-only success.
   `check` remains usable offline. Repeat an unchanged live baseline to inspect
   consistency; record variance instead of retrying until green.

Equivalent rewrites are acceptance scenarios, not a new asset format or CLI mode.
Use a pinned provider model when available. Do not report injected test results
as successful live judgments.

## Quality-authoring acceptance — Wiki only

Use temporary copies of the fictional fixture. Invoke the Skill's **generation**
workflow, not merely the generate script. Preserve approved answers; unresolved
new scenarios belong in `wiki-tests/quality.md`.

- **Missing condition:** replace the window prose with `普通用户满足期限要求时可以申请退货。`
  and refresh its anchor. The five-day and ten-day decisions cannot be derived.
  Expect a finding citing the window page and absent deadline; do not invent a
  number or mark the current Wiki as supporting the existing answers.
- **Conflict:** restore the fixture; add a Wiki rule page saying
  `普通用户签收5天的定制商品可以申请退货，本条无例外。`
  This directly conflicts with the exclusion page. Expect the five-day custom
  scenario, both locations, incompatible conclusions and decision impact in the
  quality report. Do not silently choose one page or change the confirmed answer.
- **Valid exception:** with the original fixture, the window explicitly delegates
  custom goods to the exception rule. This is not a contradiction. No arbitrary
  missing details such as refund payment channels should be flagged.

Completion requires cases, a core-to-case mapping and a quality report stating
reviewed scope and findings. A passing run alone does not satisfy this acceptance.

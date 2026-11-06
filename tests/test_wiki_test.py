import copy
import importlib.util
import json
import tempfile
import contextlib
import io
from unittest.mock import patch
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("wiki_test", ROOT / "skills/wiki-test/scripts/wiki_test.py")
wt = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wt)


class KnowledgeTestsTest(unittest.TestCase):
    def setUp(self):
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "wiki/domains/shop").mkdir(parents=True)
        (self.root / "wiki/schema.md").write_text("schema")
        self.rule = {"id": "returns", "critical": True, "facts": {"days": 7, "excluded": ["custom"]}}
        self.page = self.root / "wiki/domains/shop/returns.md"
        self.save_rule()
        self.case = {"id": "day-five", "status": "approved", "question": "Day five return is allowed.",
                     "expected": True, "targets": ["returns"], "context_rules": [], "inputs": {"days": 5},
                     "assertion": {"op": "le", "args": [{"input": "days"}, {"fact": "returns.days"}]},
                     "rationale": "Five is within seven days."}
        self.mutation = {"id": "shorten", "status": "approved", "fact": "returns.days", "before": 7,
                         "after": 3, "cases": ["day-five"], "rationale": "Five exceeds three."}
        self.suite = {"version": 1, "cases": [self.case], "mutations": [self.mutation]}
        self.save_suite()

    def save_rule(self):
        self.page.write_text("# Return rule\n\n```wiki-rule\n" + json.dumps(self.rule) + "\n```\n")

    def save_suite(self):
        wt.write_json(self.root / "wiki-tests/suite.json", self.suite)

    def report(self):
        return wt.read_json(self.root / "wiki-tests/reports/latest.json")

    def test_baseline_mutation_coverage_and_no_wiki_changes(self):
        before = self.page.read_bytes()
        suite_before = (self.root / "wiki-tests/suite.json").read_bytes()
        self.assertEqual(wt.run_suite(self.root), 0)
        report = self.report()
        self.assertEqual(report["coverage"]["mutations"], [1, 1])
        self.assertEqual(report["coverage"]["critical_rules"], [1, 1])
        self.assertEqual(report["bindings"], {"returns": ["day-five"]})
        self.assertEqual(self.page.read_bytes(), before)
        self.assertEqual((self.root / "wiki-tests/suite.json").read_bytes(), suite_before)

    def test_current_wiki_change_fails_without_using_old_expected_answers(self):
        self.rule["facts"]["days"] = 3
        self.save_rule()
        self.assertEqual(wt.run_suite(self.root), 1)
        self.assertFalse(self.report()["cases"][0]["passed"])
        self.assertEqual(self.report()["mutations"][0]["reason"], "stale precondition")

    def test_failing_baseline_cannot_kill_mutation(self):
        self.case["expected"] = False
        self.save_suite()
        self.assertEqual(wt.run_suite(self.root), 1)
        self.assertEqual(self.report()["coverage"]["mutations"], [0, 0])

    def test_insensitive_mutation_fails(self):
        self.mutation["after"] = 8
        self.save_suite()
        self.assertEqual(wt.run_suite(self.root), 1)
        self.assertEqual(self.report()["coverage"]["mutations"], [0, 1])

    def test_generation_preserves_expected_answers_and_produces_drafts_idempotently(self):
        wt.generate(self.root)
        first = wt.read_json(self.root / "wiki-tests/suite.json")
        self.assertEqual(first["cases"][0], self.case)
        self.assertTrue(all(c["status"] == "draft" for c in first["cases"][1:]))
        self.assertGreater(len(first["mutations"]), 1)
        wt.generate(self.root)
        self.assertEqual(first, wt.read_json(self.root / "wiki-tests/suite.json"))
        self.rule["facts"]["days"] = 6
        self.save_rule()
        wt.generate(self.root)
        self.assertEqual(first, wt.read_json(self.root / "wiki-tests/suite.json"))
        self.assertEqual(wt.read_json(self.root / "wiki-tests/reports/generation.json")["changed"], ["returns"])

    def test_cross_page_context_not_counted_as_target(self):
        other = copy.deepcopy(self.rule)
        other.update(id="account", critical=False, facts={"active": True})
        (self.root / "wiki/domains/shop/account.md").write_text("```wiki-rule\n" + json.dumps(other) + "\n```\n")
        self.case["context_rules"] = ["account"]
        self.case["assertion"] = {"op": "all", "args": [self.case["assertion"], {"fact": "account.active"}]}
        self.save_suite()
        self.assertEqual(wt.run_suite(self.root), 0)
        self.assertEqual(self.report()["coverage"]["rules"], [1, 2])
        self.assertEqual(self.report()["coverage"]["critical_rules"], [0, 1])

    def test_missing_binding_rejected(self):
        self.case["targets"] = ["missing"]
        self.save_suite()
        with self.assertRaisesRegex(ValueError, "bindings"):
            wt.run_suite(self.root)

    def test_removed_sources_field_is_rejected(self):
        self.rule["sources"] = []
        self.save_rule()
        with self.assertRaisesRegex(ValueError, "sources is not supported"):
            wt.load_rules(self.root)
        self.rule.pop("sources")
        self.save_rule()
        self.case["sources"] = []
        self.save_suite()
        before = (self.root / "wiki-tests/suite.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "sources is not supported"):
            wt.generate(self.root)
        self.assertEqual((self.root / "wiki-tests/suite.json").read_bytes(), before)
        with self.assertRaisesRegex(ValueError, "sources is not supported"):
            wt.load_suite(self.root, wt.load_rules(self.root)[0])
        self.case.pop("sources")
        self.semantic_fixture()
        self.suite["knowledge"][0]["sources"] = []
        self.save_suite()
        with self.assertRaisesRegex(ValueError, "sources is not supported"):
            wt.load_rules(self.root)

    def test_generate_check_and_simulated_run_never_open_raw(self):
        self.semantic_fixture()
        # Even a Wiki link to a missing external source must never be followed.
        self.page.write_text(self.page.read_text() + "\n[Source](../../../raw/policy.md)\n")
        original_open = Path.open
        opened = []
        def guarded_open(path, *args, **kwargs):
            self.assertNotIn("raw", path.resolve().parts)
            opened.append(path)
            return original_open(path, *args, **kwargs)
        calls = []
        def sender(payload):
            calls.append(payload)
            return {"model": "stub", "answers": {"judgment": {"noul": 0.9 if len(calls) == 1 else 0.1}}}
        with patch.object(Path, "open", guarded_open):
            wt.generate(self.root)
            self.assertEqual(wt.main(["check", str(self.root)]), 0)
            self.assertEqual(wt.run_suite(self.root, sender=sender), 0)
        self.assertTrue(opened)
        self.assertFalse((self.root / "raw").exists())

    def test_generate_rejects_non_wiki_binding_before_reading(self):
        self.semantic_fixture()
        self.suite["knowledge"][0]["page"] = "raw/policy.md"
        self.save_suite()
        original_open = Path.open
        def guarded_open(path, *args, **kwargs):
            self.assertNotIn("raw", path.resolve().parts)
            return original_open(path, *args, **kwargs)
        with patch.object(Path, "open", guarded_open):
            with self.assertRaisesRegex(ValueError, "outside wiki/domains"):
                wt.generate(self.root)

    def test_wiki_and_asset_symlinks_cannot_redirect_into_raw(self):
        self.semantic_fixture()
        self.page.unlink()
        self.page.symlink_to(self.root / "raw/policy.md")
        for operation in (wt.generate, wt.load_rules):
            with self.assertRaisesRegex(ValueError, "outside wiki/domains"):
                operation(self.root)
        self.page.unlink()
        self.page.write_text("# Returns\n\nReturns allowed within seven days.\n")
        suite_path = self.root / "wiki-tests/suite.json"
        suite_path.unlink()
        suite_path.symlink_to(self.root / "raw/suite.json")
        for operation in (wt.generate, wt.load_rules):
            with self.assertRaisesRegex(ValueError, "outside wiki-tests"):
                operation(self.root)

    def test_failure_report_locates_scenario_and_preserves_quality_findings(self):
        quality = self.root / "wiki-tests/reports/quality.md"
        quality.parent.mkdir(parents=True)
        quality.write_text("Unresolved scenario: custom goods on day five; conflicting Wiki rules.")
        self.rule["facts"]["days"] = 3
        self.save_rule()
        wt.generate(self.root)
        self.assertEqual(wt.run_suite(self.root), 1)
        result = self.report()["cases"][0]
        self.assertEqual(result["locations"], [{"id": "returns", "page": "wiki/domains/shop/returns.md", "lines": [3, 3]}])
        report = (quality.parent / "latest.md").read_text()
        self.assertIn(self.case["question"], report)
        self.assertIn("Expected: True. Actual: False.", report)
        self.assertIn("wiki/domains/shop/returns.md:3-3", report)
        self.assertLess(report.index("## Failed scenarios"), report.index("## Inventory statistics"))
        self.assertIn("conflicting Wiki rules", quality.read_text())

    def test_path_escape_and_duplicate_rule_rejected(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            wt.local_path(self.root, "../secret", "wiki/domains")
        self.suite["knowledge"] = [{"id": "escape", "page": "schema.md"}]
        self.save_suite()
        with self.assertRaisesRegex(ValueError, "outside wiki/domains"):
            wt.load_suite(self.root, wt.load_rules(self.root)[0])
        self.suite.pop("knowledge")
        self.save_suite()
        (self.root / "wiki/domains/shop/copy.md").write_bytes(self.page.read_bytes())
        with self.assertRaisesRegex(ValueError, "duplicate rule"):
            wt.load_rules(self.root)

    def test_boolean_numeric_types_and_arbitrary_code_rejected(self):
        with self.assertRaisesRegex(ValueError, "numeric"):
            wt.evaluate({"op": "le", "args": [{"literal": True}, {"literal": 1}]}, {}, {})
        self.assertFalse(wt.evaluate({"op": "eq", "args": [{"literal": True}, {"literal": 1}]}, {}, {}))
        with self.assertRaisesRegex(ValueError, "operator"):
            wt.evaluate({"op": "eval", "args": []}, {}, {})

    def test_empty_approved_set_not_success(self):
        self.case["status"] = "draft"
        self.mutation["status"] = "draft"
        self.save_suite()
        with self.assertRaisesRegex(ValueError, "no approved"):
            wt.run_suite(self.root)

    def test_all_branches_collect_dependencies_and_no_boolean_coercion(self):
        with self.assertRaisesRegex(ValueError, "unknown fact"):
            wt.evaluate({"op": "all", "args": [{"literal": False}, {"fact": "missing.x"}]}, {}, {})
        with self.assertRaisesRegex(ValueError, "boolean"):
            wt.evaluate({"op": "all", "args": [{"literal": 1}]}, {}, {})

    def test_json_and_nested_values_do_not_hide_type_errors(self):
        self.assertFalse(wt.same([True], [1]))
        self.assertFalse(wt.same({"x": True}, {"x": 1}))
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            wt.parse_json('{"expected": true, "expected": false}')
        with self.assertRaisesRegex(ValueError, "non-finite"):
            wt.parse_json('{"days": NaN}')

    def test_page_movement_keeps_rule_identity(self):
        self.page.rename(self.page.with_name("renamed.md"))
        self.assertEqual(wt.run_suite(self.root), 0)
        self.assertEqual(self.report()["bindings"]["returns"], ["day-five"])

    def test_drafts_do_not_inflate_coverage(self):
        other = copy.deepcopy(self.rule)
        other.update(id="uncovered", critical=False)
        (self.root / "wiki/domains/shop/other.md").write_text("```wiki-rule\n" + json.dumps(other) + "\n```\n")
        draft = copy.deepcopy(self.case)
        draft.update(id="draft", status="draft", targets=["uncovered"])
        draft["assertion"]["args"][1]["fact"] = "uncovered.days"
        self.suite["cases"].append(draft)
        self.save_suite()
        self.assertEqual(wt.run_suite(self.root), 0)
        self.assertEqual(self.report()["coverage"]["rules"], [1, 2])
        self.assertEqual(self.report()["draft_cases"], 1)

    def semantic_fixture(self):
        self.page.write_text('# Returns\n\nReturns allowed within seven days.\n')
        self.suite["knowledge"] = [{"id": "returns", "page": str(self.page.relative_to(self.root)),
                                    "lines": [3, 3],
                                    "anchors": ["Returns allowed within seven days."] * 2,
                                    "critical": True}]
        self.case.pop("assertion")
        self.case["kind"] = "semantic"
        self.mutation.pop("fact")
        self.mutation.update(kind="text", target="returns", before="seven days", after="three days")
        self.save_suite()

    def test_semantic_payload_uses_current_prose_and_question_without_answer_leak(self):
        self.semantic_fixture()
        rules, _ = wt.load_rules(self.root)
        before = wt.semantic_request(self.case, rules, "jev-latest")
        self.assertIn("seven days", before["state"]["wiki"][0]["text"])
        self.assertIn(self.case["question"], before["questions"]["judgment"]["instructions"])
        wire = json.dumps(before)
        for forbidden in ["expected", "rationale", "raw/policy.md", "assertion"]:
            self.assertNotIn(forbidden, wire)
        self.page.write_text(self.page.read_text().replace("allowed", "forbidden"))
        # Rewritten prose requires the author to refresh the binding, as with any knowledge change.
        self.suite["knowledge"][0]["anchors"] = ["Returns forbidden within seven days."] * 2
        self.save_suite()
        rules, _ = wt.load_rules(self.root)
        after = wt.semantic_request(self.case, rules, "jev-latest")
        self.assertNotEqual(before, after)
        self.case["question"] = "Day five return is forbidden."
        self.assertNotEqual(after, wt.semantic_request(self.case, rules, "jev-latest"))

    def test_semantic_runner_and_text_mutation_use_injected_judgments(self):
        self.semantic_fixture()
        calls = []
        # Stub proves orchestration only, not actual Jev language accuracy.
        def sender(payload):
            calls.append(payload)
            return {"model": "test-stub", "answers": {"judgment": {"noul": 0.9 if len(calls) == 1 else 0.1}}}
        original = self.page.read_bytes()
        self.assertEqual(wt.run_suite(self.root, sender=sender), 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("seven days", calls[0]["state"]["wiki"][0]["text"])
        self.assertIn("three days", calls[1]["state"]["wiki"][0]["text"])
        self.assertEqual(self.page.read_bytes(), original)
        self.assertEqual(self.report()["coverage"]["semantic_rules"], [1, 1])
        self.assertEqual(self.report()["coverage"]["deterministic_facts"], [0, 0])

    def test_semantic_cross_page_payload_and_missing_key_do_not_skip(self):
        self.semantic_fixture()
        second = self.page.with_name("categories.md")
        second.write_text("Custom goods excluded.")
        self.suite["knowledge"].append({"id": "categories", "page": str(second.relative_to(self.root))})
        self.case["context_rules"] = ["categories"]
        self.save_suite()
        rules, _ = wt.load_rules(self.root)
        wt.load_suite(self.root, rules)
        self.assertEqual(len(wt.semantic_request(self.case, rules, "jev-latest")["state"]["wiki"]), 2)
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(ValueError, "TYPESAFE_API_KEY"):
                wt.run_suite(self.root)

    def test_semantic_invalid_probability_and_missing_anchor_rejected(self):
        self.semantic_fixture()
        rules, _ = wt.load_rules(self.root)
        for value in [True, float("nan"), 1.1, -0.1]:
            with self.assertRaisesRegex(ValueError, "invalid Jev"):
                wt.execute_case(self.case, rules, "jev-latest", lambda p: {
                    "model": "stub", "answers": {"judgment": {"noul": value}}})
        self.page.write_text("# Returns\n\nProse was rewritten.")
        with self.assertRaisesRegex(ValueError, "stale line binding"):
            wt.load_rules(self.root)

    def test_partial_fact_coverage_is_visible(self):
        wt.run_suite(self.root)
        self.assertEqual(self.report()["coverage"]["deterministic_facts"], [1, 2])
        self.assertEqual(self.report()["coverage"]["semantic_rules"], [0, 1])

    def test_mixed_set_runs_all_cases_without_backend_selection(self):
        local = copy.deepcopy(self.case)
        self.semantic_fixture()
        other = copy.deepcopy(self.rule)
        other["id"] = "limits"
        (self.page.parent / "limits.md").write_text("```wiki-rule\n" + json.dumps(other) + "\n```\n")
        local.update(id="local-days", targets=["limits"])
        local["assertion"]["args"][1]["fact"] = "limits.days"
        self.suite["cases"].append(local)
        self.save_suite()
        calls = []
        def sender(payload):
            calls.append(payload)
            return {"model": "test-stub", "answers": {"judgment": {"noul": 0.9 if len(calls) == 1 else 0.1}}}
        self.assertEqual(wt.run_suite(self.root, sender=sender), 0)
        self.assertEqual({r["kind"] for r in self.report()["cases"]}, {"semantic", "deterministic"})
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.report()["coverage"]["deterministic_facts"], [1, 2])

    def test_prose_change_is_in_inventory_even_with_unchanged_json(self):
        wt.generate(self.root)
        self.page.write_text(self.page.read_text() + "\nNew exception applies.\n")
        wt.generate(self.root)
        change = wt.read_json(self.root / "wiki-tests/reports/generation.json")
        self.assertEqual(change["changed"], ["returns"])

    def test_generate_reports_deleted_semantic_page_without_dropping_cases(self):
        self.semantic_fixture()
        wt.generate(self.root)
        before = (self.root / "wiki-tests/suite.json").read_bytes()
        self.page.unlink()
        wt.generate(self.root)
        queue = wt.read_json(self.root / "wiki-tests/reports/authoring.json")
        self.assertEqual(queue["removed_knowledge"], ["returns"])
        self.assertEqual(queue["missing_bindings"][0]["reason"], "missing page")
        self.assertEqual((self.root / "wiki-tests/suite.json").read_bytes(), before)

    def test_incomplete_run_cannot_leave_previous_success_as_latest(self):
        wt.run_suite(self.root)
        self.assertTrue(self.report()["completed"])
        self.semantic_fixture()
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(ValueError, "TYPESAFE_API_KEY"):
                wt.run_suite(self.root)
        self.assertFalse(self.report()["completed"])
        self.assertNotIn("PASS", (self.root / "wiki-tests/reports/latest.md").read_text())

    def test_overlapping_context_rejected_before_mutation(self):
        self.semantic_fixture()
        duplicate = copy.deepcopy(self.suite["knowledge"][0])
        duplicate.update(id="same-page", lines=[1, 3],
                         anchors=["# Returns", "Returns allowed within seven days."])
        self.suite["knowledge"].append(duplicate)
        self.case["context_rules"] = ["same-page"]
        self.save_suite()
        with self.assertRaisesRegex(ValueError, "overlapping"):
            wt.load_suite(self.root, wt.load_rules(self.root)[0])

    def test_generate_relocates_drifted_lines_and_run_stays_strict(self):
        self.semantic_fixture()
        self.page.write_text('# Returns\n\nNote: edited.\n\nReturns allowed within seven days.\n')
        with self.assertRaisesRegex(ValueError, "stale line binding"):
            wt.run_suite(self.root, sender=lambda p: {"model": "stub", "answers": {"judgment": {"noul": 0.9}}})
        wt.generate(self.root)
        suite = wt.read_json(self.root / "wiki-tests/suite.json")
        self.assertEqual(suite["knowledge"][0]["lines"], [5, 5])
        calls = []
        def sender(payload):
            calls.append(payload)
            return {"model": "test-stub", "answers": {"judgment": {"noul": 0.9 if len(calls) == 1 else 0.1}}}
        self.assertEqual(wt.run_suite(self.root, sender=sender), 0)
        self.assertIn("seven days", calls[0]["state"]["wiki"][0]["text"])

    def test_extreme_exponent_is_not_accepted_as_finite_json(self):
        with self.assertRaisesRegex(ValueError, "non-finite"):
            wt.parse_json('{"value": 1e999}')

    def test_bundled_core_maps_and_mutations_reference_current_assets(self):
        for root in (ROOT / "examples/demo-wiki", ROOT / "skills/wiki-test/assets/semantic-example"):
            rules, _ = wt.load_rules(root)
            suite = wt.load_suite(root, rules)
            cores = wt.read_json(root / "wiki-tests/cores.json")["cores"]
            self.assertCountEqual([cid for core in cores for cid in core["cases"]],
                                  [c["id"] for c in suite["cases"]])
            self.assertCountEqual([mid for core in cores for mid in core["mutations"]],
                                  [m["id"] for m in suite["mutations"]])
            for mutation in suite["mutations"]:
                self.assertEqual(rules[mutation["target"]]["text"].count(mutation["before"]), 1)

    def test_demo_order_mutations_do_not_leave_opposite_order_in_context(self):
        root = ROOT / "examples/demo-wiki"
        rules, _ = wt.load_rules(root)
        suite = wt.load_suite(root, rules)
        cases = {c["id"]: c for c in suite["cases"]}
        for mid, old_phrases, new_phrases in [
            ("m-risk-order", ["先于活动准入和抽奖执行", "先执行风险校验，再进行活动准入"],
             ["晚于活动准入但先于抽奖执行", "先执行活动准入检查，再进行风险校验"]),
            ("m-counting-order", ["在读取抽奖活动聚合后增加抽奖计数", "先获取对应抽奖活动的聚合，再增加"],
             ["在读取抽奖活动聚合前增加抽奖计数", "先增加本次抽奖的尝试计数，再获取"]),
        ]:
            mutation = next(m for m in suite["mutations"] if m["id"] == mid)
            changed = copy.deepcopy(rules)
            changed[mutation["target"]]["text"] = changed[mutation["target"]]["text"].replace(
                mutation["before"], mutation["after"], 1)
            for cid in mutation["cases"]:
                request = wt.semantic_request(cases[cid], changed, "stub")
                context = "\n".join(part["text"] for part in request["state"]["wiki"])
                for phrase in old_phrases:
                    self.assertNotIn(phrase, context)
                for phrase in new_phrases:
                    self.assertIn(phrase, context)

    def test_jev_adapter_wire_request_without_network(self):
        self.semantic_fixture()
        payload = wt.semantic_request(self.case, wt.load_rules(self.root)[0], "jev-latest")
        with patch.dict("os.environ", {"TYPESAFE_API_KEY": "test-key"}), patch.object(wt.urllib.request, "urlopen") as transport:
            transport.return_value.__enter__.return_value.read.return_value = b'{"model":"stub","answers":{"judgment":{"noul":0.9}}}'
            response = wt.jev_request(payload)
            request = transport.call_args[0][0]
            self.assertEqual(request.full_url, "https://api.typesafe.ai/v1/systemone")
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.get_header("Authorization"), "Bearer test-key")
            self.assertEqual(json.loads(request.data), payload)
            self.assertEqual(response["model"], "stub")


if __name__ == "__main__":
    unittest.main()

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INIT = ROOT / "skills/wiki-init/scripts/initialize_wiki.py"
SCHEMA = ROOT / "skills/wiki-lint/scripts/check_schema.py"
EVIDENCE = ROOT / "skills/wiki-lint/scripts/check_evidence.py"
LINT = ROOT / "skills/wiki-lint/scripts/lint_wiki.py"


def run(script, root, *args):
    return subprocess.run([sys.executable, str(script), str(root), *args], capture_output=True, text=True)


def page(title, kind, body="", relations=""):
    return (f"# {title}\n\n> Type: {kind}\n> Domain: science\n"
            "> Aliases: None\n> Sources: Example\n> Raw: [x](../../../../raw/x.md)\n> Updated: 2026-01-01\n"
            + (f"\n{body.strip()}\n" if body else "")
            + (f"\n## Relations\n\n{relations}" if relations else ""))


def minimal_page(title, kind, body=""):
    return (f"# {title}\n\n> Type: {kind}\n> Raw: [x](../../../../raw/x.md)\n> Updated: 2026-01-01\n"
            + (f"\n{body.strip()}\n" if body else ""))


WORKFLOW = """## Overview

Processes a widget request.

## Steps

1. Check the [Widget](../entities/widget.md).
"""

RULE = """## Overview

Determines whether a widget is eligible.

## Rule

Accept only active widgets.
"""

STATE_MACHINE = """## Overview

Models a widget lifecycle.

## States

| State | Meaning |
|---|---|
| Active | The widget can be used. |

## Transitions

| From | Trigger | Guard | To |
|---|---|---|---|
| Active | Disable | None | Disabled |
"""


class InitWikiTest(unittest.TestCase):
    def test_creates_workflow_skeleton_idempotently(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(run(INIT, root).returncode, 0)
            schema = (root / "wiki/schema.md").read_text()
            self.assertIn("StateMachine", schema)
            self.assertNotIn("Class Hierarchy", schema)
            self.assertFalse((root / "wiki/domains").exists())
            self.assertEqual(run(INIT, root).returncode, 0)

    def test_refuses_existing_wiki_without_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "wiki/old").mkdir(parents=True)
            result = run(INIT, root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("refusing to overwrite", result.stderr)

    def test_lint_runner_appends_a_single_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(run(INIT, root).returncode, 0)
            result = run(LINT, root, "--strict")
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertRegex(
                (root / "wiki/log.md").read_text(),
                r"## \[\d{4}-\d{2}-\d{2}\] lint \| 0 issues found, 0 auto-fixed",
            )


class SchemaLintTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.assertEqual(run(INIT, self.root).returncode, 0)
        self.domain = self.root / "wiki/domains/science"
        for name in ("entities", "workflows", "rules", "state-machines", "events"):
            (self.domain / name).mkdir(parents=True, exist_ok=True)
        raw = self.root / "raw/x.md"
        raw.write_text("# Source\n")

    def tearDown(self):
        self.tmp.cleanup()

    def index(self, *paths):
        (self.root / "wiki/index.md").write_text("# Knowledge Base Index\n\n" + "\n".join(f"- [p]({p})" for p in paths))

    def write(self, directory, name, content):
        (self.domain / directory / name).write_text(content)

    def ingest_log(self, coverage):
        (self.root / "wiki/log.md").write_text(
            "# Wiki Log\n\n"
            "## [2026-01-01] ingest | Widget source\n"
            "- Disposition: New\n"
            "- Raw: raw/x.md\n\n"
            "### Coverage\n\n"
            "| Type | Disposition | Pages or rationale |\n"
            "|---|---|---|\n"
            + coverage
        )

    def test_accepts_all_new_types_and_specialized_relations(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        self.write("rules", "eligibility.md", page("Eligibility", "Rule", RULE, "- governs: [Widget](../entities/widget.md)\n"))
        self.write("state-machines", "widget.md", page("Widget lifecycle", "StateMachine", STATE_MACHINE, "- state-machine-of: [Widget](../entities/widget.md)\n"))
        self.write("workflows", "process.md", page("Widget process", "Workflow", WORKFLOW, "- uses: [Widget](../entities/widget.md)\n- uses: [Eligibility](../rules/eligibility.md)\n- uses: [Widget lifecycle](../state-machines/widget.md)\n"))
        self.write("events", "created.md", page("Widget created", "Event", "## Overview\n\nCreated on request.", "- occurred-in: [Widget](../entities/widget.md)\n"))
        self.index("domains/science/entities/widget.md", "domains/science/rules/eligibility.md", "domains/science/state-machines/widget.md", "domains/science/workflows/process.md", "domains/science/events/created.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_rejects_undeclared_type(self):
        self.write("entities", "old.md", page("Old", "Concept", "## Overview\n\nOld."))
        self.index("domains/science/entities/old.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid Type: Concept", result.stdout)

    def test_accepts_minimal_required_metadata(self):
        self.write("entities", "widget.md", minimal_page("Widget", "Entity", "## Overview\n\nA business object."))
        self.index("domains/science/entities/widget.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_optional_domain_is_checked_only_when_present(self):
        content = minimal_page("Widget", "Entity", "## Overview\n\nA business object.").replace("> Raw:", "> Domain: other\n> Raw:")
        self.write("entities", "widget.md", content)
        self.index("domains/science/entities/widget.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Domain other does not match path domain science", result.stdout)

    def test_rejects_missing_raw(self):
        self.write("entities", "widget.md", "# Widget\n\n> Type: Entity\n> Updated: 2026-01-01\n\n## Overview\n\nA business object.\n")
        self.index("domains/science/entities/widget.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing Raw", result.stdout)

    def test_rejects_missing_updated(self):
        self.write("entities", "widget.md", "# Widget\n\n> Type: Entity\n> Raw: [x](../../../../raw/x.md)\n\n## Overview\n\nA business object.\n")
        self.index("domains/science/entities/widget.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing Updated", result.stdout)

    def test_evidence_accepts_multiple_raw_fields(self):
        (self.root / "raw/y.md").write_text("# Second source\n")
        self.write("entities", "widget.md", "# Widget\n\n> Type: Entity\n> Raw: [x](../../../../raw/x.md)\n> Raw: [y](../../../../raw/y.md)\n\n## Overview\n\nA business object.\n")
        self.assertEqual(run(EVIDENCE, self.root, "--strict").returncode, 0)

    def test_rejects_missing_specialized_structure_and_relation_mismatch(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object.", "- uses: [Rule](../rules/rule.md)\n"))
        self.write("rules", "rule.md", page("Rule", "Rule", "## Overview\n\nMissing rule."))
        self.write("workflows", "workflow.md", page("Workflow", "Workflow", "## Steps\n\n- Not ordered."))
        self.write("state-machines", "state.md", page("State", "StateMachine", "## States\n\n| State | Meaning |\n|---|---|\n\n## Transitions\n\n| From | Trigger | Guard | To |\n|---|---|---|---|"))
        self.index("domains/science/entities/widget.md", "domains/science/rules/rule.md", "domains/science/workflows/workflow.md", "domains/science/state-machines/state.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires subject Type Workflow", result.stdout)
        self.assertIn("Rule requires a non-empty ## Rule section", result.stdout)
        self.assertIn("Workflow requires a non-empty ordered ## Steps list", result.stdout)
        self.assertIn("StateMachine requires a non-empty ## States table", result.stdout)
        self.assertIn("StateMachine requires a non-empty ## Transitions table", result.stdout)

    def test_rejects_broken_content_link_outside_relations(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        workflow = WORKFLOW.replace("[Widget](../entities/widget.md)", "[Missing](missing.md)")
        self.write("workflows", "workflow.md", page("Workflow", "Workflow", workflow, "- uses: [Widget](../entities/widget.md)\n"))
        self.index("domains/science/entities/widget.md", "domains/science/workflows/workflow.md")
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unresolvable or out-of-wiki content link: missing.md", result.stdout)

    def test_rejects_asymmetric_inverse_declaration(self):
        schema = self.root / "wiki/schema.md"
        schema.write_text(schema.read_text().replace("| has-part | Any | Any | part-of |", "| has-part | Any | Any | None |"))
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("inverse has-part does not point back", result.stdout)

    def test_default_mode_reports_but_preserves_zero_exit(self):
        self.write("entities", "old.md", page("Old", "Concept", "## Overview\n\nOld."))
        self.index("domains/science/entities/old.md")
        self.assertEqual(run(SCHEMA, self.root).returncode, 0)

    def test_evidence_strict_mode_fails_for_unreferenced_raw(self):
        raw = self.root / "raw/t/orphan.md"
        raw.parent.mkdir(parents=True)
        raw.write_text("# Orphan\n")
        self.assertNotEqual(run(EVIDENCE, self.root, "--strict").returncode, 0)

    def test_accepts_complete_coverage(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        self.index("domains/science/entities/widget.md")
        self.ingest_log(
            "| Entity | Added | [Widget](domains/science/entities/widget.md) |\n"
            "| Workflow | N/A | The source has no ordered collaboration. |\n"
            "| Rule | N/A | The source has no decision mechanism. |\n"
            "| StateMachine | N/A | The source has no lifecycle transitions. |\n"
            "| Event | N/A | The source has no business occurrence. |\n"
        )
        result = run(SCHEMA, self.root, "--strict")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_rejects_missing_type_from_coverage(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        self.index("domains/science/entities/widget.md")
        self.ingest_log(
            "| Entity | Added | [Widget](domains/science/entities/widget.md) |\n"
            "| Workflow | N/A | The source has no ordered collaboration. |\n"
            "| Rule | N/A | The source has no decision mechanism. |\n"
            "| StateMachine | N/A | The source has no lifecycle transitions. |\n"
        )
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("is missing Type Event", result.stdout)

    def test_rejects_coverage_that_omits_grounded_page(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        self.write("entities", "gadget.md", page("Gadget", "Entity", "## Overview\n\nAnother business object."))
        self.index("domains/science/entities/widget.md", "domains/science/entities/gadget.md")
        self.ingest_log(
            "| Entity | Added | [Widget](domains/science/entities/widget.md) |\n"
            "| Workflow | N/A | The source has no ordered collaboration. |\n"
            "| Rule | N/A | The source has no decision mechanism. |\n"
            "| StateMachine | N/A | The source has no lifecycle transitions. |\n"
            "| Event | N/A | The source has no business occurrence. |\n"
        )
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("omits grounded page", result.stdout)

    def test_rejects_linked_na_and_wrong_type_coverage(self):
        self.write("entities", "widget.md", page("Widget", "Entity", "## Overview\n\nA business object."))
        self.index("domains/science/entities/widget.md")
        self.ingest_log(
            "| Entity | N/A | [Widget](domains/science/entities/widget.md) |\n"
            "| Workflow | N/A | The source has no ordered collaboration. |\n"
            "| Rule | Added | [Widget](domains/science/entities/widget.md) |\n"
            "| StateMachine | N/A | The source has no lifecycle transitions. |\n"
            "| Event | N/A | The source has no business occurrence. |\n"
        )
        result = run(SCHEMA, self.root, "--strict")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("needs a link-free N/A rationale", result.stdout)
        self.assertIn("Type Rule links to Entity page", result.stdout)


if __name__ == "__main__":
    unittest.main()

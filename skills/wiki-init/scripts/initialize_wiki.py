#!/usr/bin/env python3
"""Create an empty workflow-oriented wiki without overwriting content."""
from __future__ import annotations

import sys
from pathlib import Path

SCHEMA = """# Wiki Schema

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
"""
INDEX = "# Knowledge Base Index\n\n## Domains\n\n"
LOG = "# Wiki Log\n"
def write_if_missing(path: Path, content: str) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path.cwd()
    wiki = root / "wiki"
    if wiki.is_dir() and not (wiki / "schema.md").exists() and any(wiki.iterdir()):
        print("wiki/ exists without schema.md; refusing to overwrite", file=sys.stderr)
        return 1
    created = []
    files = (
        (root / "raw" / ".gitkeep", ""), (wiki / "schema.md", SCHEMA),
        (wiki / "index.md", INDEX), (wiki / "log.md", LOG),
    )
    for path, content in files:
        if write_if_missing(path, content):
            created.append(path.relative_to(root).as_posix())
    print("created:" if created else "already initialized:")
    print("\n".join(created) if created else root.as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

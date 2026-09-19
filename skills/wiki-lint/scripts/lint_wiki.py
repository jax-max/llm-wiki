#!/usr/bin/env python3
"""Run both wiki checks and append one lint result to wiki/log.md."""
from __future__ import annotations

import re
import subprocess
import sys
from datetime import date
from pathlib import Path


EVIDENCE_SUMMARY_RE = re.compile(
    r"(\d+) fidelity suspect\(s\), (\d+) evidence error\(s\), (\d+) unreferenced raw file\(s\)"
    r"(?:, (\d+) modified raw file\(s\))?(?:, (\d+) page\(s\) behind evidence)?"
)
SCHEMA_SUMMARY_RE = re.compile(r"(\d+) schema issue\(s\)")


def issue_count(output: str, pattern: re.Pattern[str], label: str) -> int:
    match = pattern.search(output)
    if not match:
        print(f"warning: {label} summary line not recognized; issue count may be wrong", file=sys.stderr)
        return 0
    return sum(map(int, match.groups()))


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    args = [arg for arg in argv[1:] if arg != "--strict"]
    if len(args) > 1:
        print("usage: lint_wiki.py [project-root] [--strict]", file=sys.stderr)
        return 2
    root = Path(args[0]).resolve() if args else Path.cwd()
    scripts = Path(__file__).resolve().parent
    commands = [
        [sys.executable, str(scripts / "check_evidence.py"), str(root), *( ["--strict"] if strict else [])],
        [sys.executable, str(scripts / "check_schema.py"), str(root), *( ["--strict"] if strict else [])],
    ]
    results = [subprocess.run(command, capture_output=True, text=True) for command in commands]
    for result in results:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
        if result.stderr:
            print(result.stderr, file=sys.stderr, end="" if result.stderr.endswith("\n") else "\n")

    issues = issue_count(results[0].stdout, EVIDENCE_SUMMARY_RE, "evidence check") + issue_count(
        results[1].stdout, SCHEMA_SUMMARY_RE, "schema check"
    )
    log = root / "wiki" / "log.md"
    if log.is_file():
        with log.open("a", encoding="utf-8") as handle:
            handle.write(f"\n## [{date.today().isoformat()}] lint | {issues} issues found, 0 auto-fixed\n")
    else:
        print(f"warning: cannot append lint result; missing {log}", file=sys.stderr)
    return 1 if strict and any(result.returncode for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

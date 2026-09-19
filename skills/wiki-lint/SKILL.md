---
name: wiki-lint
description: Check a workflow-oriented research wiki for source evidence, raw-file integrity, schema metadata, typed relations, ingest coverage, broken links, and duplicate-entity candidates. Chinese triggers: 检查 wiki, 校验证据, wiki 体检.
---

# Lint the Wiki

Require `wiki/schema.md`. Run the bundled entrypoint from the project root:

```bash
python3 <skill-dir>/scripts/lint_wiki.py <project-root> --strict
```

On native Windows use `python` or `py -3` if `python3` is not found; if none is
available, ask the user to install Python 3.8+ (e.g.
`winget install Python.Python.3.12`) or use WSL.

It runs both checks and appends one lint result to `wiki/log.md`. The
individual `check_evidence.py` and `check_schema.py` commands remain read-only
for CI and targeted diagnostics. The evidence checker also recomputes each
raw file's SHA-256 against the digest recorded at ingest: a mismatch means
immutable evidence was modified after ingest and grounds for reviewing every
page linked to that file; raw files recorded without a digest are listed as
unhashed information only. Digest-anchored ingest dates also feed a freshness
check: a page whose `Updated` predates the latest ingest of a linked Raw was
not recompiled after its evidence changed and is reported.

Auto-fix only safe path repairs: an index entry or relation link with exactly
one unambiguous existing target. Update the index after such a repair.

Never auto-fix factual evidence, Type/Domain classification, aliases,
duplicate entities, conflicting claims, or relation semantics. Report them for
the user. Treat evidence-check fidelity suspects as leads requiring contextual
judgment, not automatic errors.

For every ingest entry, verify the `### Coverage` table
has every declared Page Type, valid dispositions, correctly typed links, and
all pages grounded in the entry's Raw. Missing coverage is a strict-mode
failure; do not infer a source's semantic candidates automatically.

The bundled entrypoint reports `0 auto-fixed`: it does not modify knowledge
pages. If an agent makes a safe path repair, it must update the index and
record the actual auto-fix count in the log entry.

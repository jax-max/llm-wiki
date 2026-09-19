#!/usr/bin/env python3
"""Statically validate the workflow-oriented wiki described by wiki/schema.md."""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

FIELD_RE = re.compile(r"^>\s*([A-Za-z]+):\s*(.*)$")
RELATION_RE = re.compile(r"^-\s*([a-z-]+):\s*\[[^]]+\]\(([^)]+)\)\s*$")
LINK_RE = re.compile(r"\[[^]]+\]\(([^)]+)\)")
TABLE_RE = re.compile(r"^\|\s*(.*?)\s*\|\s*(.*?)\s*\|(?:\s*(.*?)\s*\|)?(?:\s*(.*?)\s*\|)?\s*$")
INGEST_HEADING_RE = re.compile(r"^## \[[^]]+\] ingest \| .+$", re.M)
LOG_RAW_RE = re.compile(r"^- Raw:\s*`?([^`\n]+?)`?\s*$", re.M)
LOG_DISPOSITION_RE = re.compile(r"^- Disposition:\s*(.+?)\s*$", re.M)
COVERAGE_HEADING_RE = re.compile(r"^### Coverage\s*$", re.M)
COVERAGE_DISPOSITIONS = {"Added", "Updated", "Reused", "N/A"}


@dataclass(frozen=True)
class Relation:
    subject_types: frozenset[str] | None
    object_types: frozenset[str] | None
    inverse: str | None


@dataclass(frozen=True)
class Schema:
    page_types: dict[str, str]
    required_fields: tuple[str, ...]
    relations: dict[str, Relation]


def section(text: str, heading: str) -> str:
    match = re.search(rf"^## {re.escape(heading)}\s*$([\s\S]*?)(?=^## |\Z)", text, re.M)
    return match.group(1) if match else ""


def rows(text: str) -> list[list[str]]:
    output = []
    for line in text.splitlines():
        match = TABLE_RE.match(line)
        if not match or match.group(1).startswith("---") or match.group(1) in {"Type", "Verb"}:
            continue
        output.append([value.strip().strip("`") for value in match.groups() if value is not None])
    return output


def declared_types(value: str, page_types: dict[str, str]) -> frozenset[str] | None:
    if value.casefold() == "any":
        return None
    names = frozenset(name.strip() for name in value.split(",") if name.strip())
    if not names or not names <= page_types.keys():
        raise ValueError(f"undeclared page Type in relation signature: {value}")
    return names


def load_schema(path: Path) -> Schema:
    text = path.read_text(encoding="utf-8")
    page_types = {r[0]: r[1].strip("/ ") for r in rows(section(text, "Page Types")) if len(r) >= 2}
    metadata_text = section(text, "Required Metadata")
    required_match = re.search(r"((?:`[A-Za-z]+`(?:,?\s*(?:and\s+)?)?)+)are required", metadata_text)
    required_fields = tuple(re.findall(r"`([A-Za-z]+)`", required_match.group(1) if required_match else ""))
    relations = {
        r[0]: Relation(declared_types(r[1], page_types), declared_types(r[2], page_types), None if r[3].casefold() == "none" else r[3])
        for r in rows(section(text, "Relation Signatures")) if len(r) >= 4
    }
    if not page_types or not required_fields or not relations:
        raise ValueError("schema must define Page Types, Required Metadata, and Relation Signatures")
    return Schema(page_types, required_fields, relations)


def metadata(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if not line.startswith(">"):
            if fields:
                break
            continue
        match = FIELD_RE.match(line)
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def title(text: str) -> str:
    return next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), "")


def schema_errors(schema: Schema) -> list[str]:
    errors = []
    for verb, relation in schema.relations.items():
        if relation.inverse and relation.inverse not in schema.relations:
            errors.append(f"relation {verb} has undeclared inverse {relation.inverse}")
        elif relation.inverse and schema.relations[relation.inverse].inverse != verb:
            errors.append(f"relation {verb} inverse {relation.inverse} does not point back")
    return errors


def resolved_page(page: Path, target: str, wiki: Path) -> Path | None:
    resolved = (page.parent / target).resolve()
    return resolved if resolved.suffix == ".md" and resolved.is_file() and resolved.is_relative_to(wiki.resolve()) else None


def content_link_errors(page: Path, text: str, wiki: Path) -> list[str]:
    """Check ordinary relative Wiki page links outside metadata and Relations.

    Raw provenance links belong to the metadata header and are checked by the
    evidence checker. Relation links have their own type-aware validation.
    """
    errors, in_relations = [], False
    for line in text.splitlines():
        if line == "## Relations":
            in_relations = True
            continue
        if in_relations and line.startswith("## "):
            in_relations = False
        if in_relations or re.match(r"^>\s*(?:Type|Domain|Aliases|Sources?|Raw|Collected|Published|Updated):", line):
            continue
        for target in LINK_RE.findall(line):
            path = target.split("#", 1)[0]
            if not path or not path.endswith(".md") or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", path):
                continue
            if not resolved_page(page, path, wiki):
                errors.append(f"unresolvable or out-of-wiki content link: {target}")
    return errors


def compatible(actual: str | None, expected: frozenset[str] | None) -> bool:
    return actual is not None and (expected is None or actual in expected)


def nonempty_section(text: str, heading: str) -> bool:
    return bool(section(text, heading).strip())


def table_has_columns_and_row(text: str, heading: str, columns: tuple[str, ...]) -> bool:
    table_rows = rows(section(text, heading))
    for index, row in enumerate(table_rows):
        if tuple(row[:len(columns)]) == columns:
            return any(len(candidate) >= len(columns) for candidate in table_rows[index + 1:])
    return False


def page_structure_errors(page_type: str | None, text: str) -> list[str]:
    if page_type == "Workflow":
        steps = section(text, "Steps")
        if not any(re.match(r"^\s*\d+\.\s+\S", line) for line in steps.splitlines()):
            return ["Workflow requires a non-empty ordered ## Steps list"]
    if page_type == "Rule" and not nonempty_section(text, "Rule"):
        return ["Rule requires a non-empty ## Rule section"]
    if page_type == "StateMachine":
        errors = []
        if not table_has_columns_and_row(text, "States", ("State", "Meaning")):
            errors.append("StateMachine requires a non-empty ## States table with State and Meaning columns")
        if not table_has_columns_and_row(text, "Transitions", ("From", "Trigger", "Guard", "To")):
            errors.append("StateMachine requires a non-empty ## Transitions table with From, Trigger, Guard, and To columns")
        return errors
    return []


def check_page(page: Path, root: Path, schema: Schema) -> list[str]:
    wiki, relative, text = root / "wiki", page.relative_to(root / "wiki"), page.read_text(encoding="utf-8")
    if page.name == "overview.md":
        expected = relative.parts[1] if len(relative.parts) >= 2 and relative.parts[0] == "domains" else None
        domain = metadata(text).get("Domain")
        return [] if expected is None or not domain or domain == expected else [f"Domain does not match path domain {expected}"]
    errors, fields = [], metadata(text)
    page_type, domain = fields.get("Type"), fields.get("Domain")
    for field in schema.required_fields:
        if not fields.get(field):
            errors.append(f"missing {field}")
    if page_type not in schema.page_types:
        errors.append(f"invalid Type: {page_type or '(missing)'}")
    elif len(relative.parts) < 4 or relative.parts[0] != "domains" or relative.parts[2] != schema.page_types[page_type]:
        errors.append(f"Type {page_type} does not match path")
    if domain and len(relative.parts) >= 2 and relative.parts[0] == "domains" and domain != relative.parts[1]:
        errors.append(f"Domain {domain} does not match path domain {relative.parts[1]}")
    errors.extend(page_structure_errors(page_type, text))
    errors.extend(content_link_errors(page, text, wiki))
    in_relations = False
    for line in text.splitlines():
        if line == "## Relations":
            in_relations = True
            continue
        if in_relations and line.startswith("## "):
            in_relations = False
        if not in_relations or not line.startswith("-"):
            continue
        match = RELATION_RE.match(line)
        if not match:
            errors.append("malformed relation")
            continue
        verb, target = match.groups()
        signature = schema.relations.get(verb)
        if not signature:
            errors.append(f"invalid relation verb: {verb}")
            continue
        if not compatible(page_type, signature.subject_types):
            expected = ", ".join(sorted(signature.subject_types)) if signature.subject_types else "Any"
            errors.append(f"relation {verb} requires subject Type {expected}, got {page_type or '(missing)'}")
        target_page = resolved_page(page, target, wiki)
        if not target_page:
            errors.append(f"unresolvable or out-of-wiki relation target: {target}")
            continue
        target_type = metadata(target_page.read_text(encoding="utf-8")).get("Type")
        if not compatible(target_type, signature.object_types):
            expected = ", ".join(sorted(signature.object_types)) if signature.object_types else "Any"
            errors.append(f"relation {verb} requires object Type {expected}, got {target_type or '(missing)'}")
    return errors


def content_pages(wiki: Path) -> list[Path]:
    domain_root = wiki / "domains"
    return [p for p in sorted(domain_root.rglob("*.md")) if p.name != "overview.md"] if domain_root.is_dir() else []


def duplicate_entities(pages: list[Path], root: Path) -> list[str]:
    identifiers: dict[str, list[Path]] = {}
    for page in pages:
        text = page.read_text(encoding="utf-8")
        fields = metadata(text)
        if fields.get("Type") != "Entity":
            continue
        for name in [title(text)] + fields.get("Aliases", "").split(";"):
            key = re.sub(r"\s+", " ", name.strip().casefold())
            if key and key != "none":
                identifiers.setdefault(key, []).append(page)
    return ["duplicate entity candidate: " + key + " -> " + ", ".join(str(p.relative_to(root)) for p in paths) for key, paths in sorted(identifiers.items()) if len(set(paths)) > 1]


def index_errors(root: Path, pages: list[Path]) -> list[str]:
    wiki, index = root / "wiki", root / "wiki" / "index.md"
    if not index.is_file():
        return ["missing wiki/index.md"]
    values = LINK_RE.findall(index.read_text(encoding="utf-8"))
    targets = {(index.parent / value).resolve() for value in values}
    errors = [f"index link is missing or outside wiki: {value}" for value in values if not resolved_page(index, value, wiki)]
    errors.extend(f"typed page missing from index: {p.relative_to(root)}" for p in pages if p.resolve() not in targets)
    return errors


def markdown_table(lines: list[str]) -> list[list[str]]:
    table = []
    for line in lines:
        if not line.startswith("|"):
            if table:
                break
            continue
        values = [value.strip() for value in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", value) for value in values):
            continue
        table.append(values)
    return table


def page_raw_targets(page: Path) -> set[Path]:
    targets, saw_metadata = set(), False
    for line in page.read_text(encoding="utf-8").splitlines():
        if not line.startswith(">"):
            if saw_metadata:
                break
            continue
        saw_metadata = True
        if not re.match(r"^>\s*Raw:", line):
            continue
        for target in LINK_RE.findall(line):
            targets.add((page.parent / target).resolve())
    return targets


def coverage_table_errors(block: str, raw: Path, root: Path, schema: Schema) -> tuple[list[str], set[Path]]:
    heading = COVERAGE_HEADING_RE.search(block)
    if not heading:
        return [f"ingest entry for {raw.relative_to(root)} has no ### Coverage table"], set()
    table = markdown_table(block[heading.end():].splitlines())
    if not table or table[0] != ["Type", "Disposition", "Pages or rationale"]:
        return [f"coverage table for {raw.relative_to(root)} must use Type, Disposition, Pages or rationale columns"], set()

    errors, covered, seen = [], set(), set()
    for row in table[1:]:
        if len(row) != 3:
            errors.append(f"coverage table for {raw.relative_to(root)} has malformed row")
            continue
        page_type, disposition, value = row
        if page_type not in schema.page_types:
            errors.append(f"coverage table for {raw.relative_to(root)} has undeclared Type {page_type}")
            continue
        if page_type in seen:
            errors.append(f"coverage table for {raw.relative_to(root)} repeats Type {page_type}")
            continue
        seen.add(page_type)
        if disposition not in COVERAGE_DISPOSITIONS:
            errors.append(f"coverage table for {raw.relative_to(root)} has invalid disposition {disposition}")
            continue
        links = LINK_RE.findall(value)
        if disposition == "N/A":
            if not value or links:
                errors.append(f"coverage table for {raw.relative_to(root)} Type {page_type} needs a link-free N/A rationale")
            continue
        if not links:
            errors.append(f"coverage table for {raw.relative_to(root)} Type {page_type} needs typed-page links")
            continue
        for target in links:
            page = resolved_page(root / "wiki/log.md", target, root / "wiki")
            if not page:
                errors.append(f"coverage table for {raw.relative_to(root)} has unresolvable page link {target}")
                continue
            actual_type = metadata(page.read_text(encoding="utf-8")).get("Type")
            if actual_type != page_type:
                errors.append(f"coverage table for {raw.relative_to(root)} Type {page_type} links to {actual_type or 'untyped'} page {target}")
                continue
            if raw.resolve() not in page_raw_targets(page):
                errors.append(f"coverage table for {raw.relative_to(root)} lists page not grounded in this Raw: {target}")
                continue
            covered.add(page.resolve())
    missing = set(schema.page_types) - seen
    errors.extend(f"coverage table for {raw.relative_to(root)} is missing Type {page_type}" for page_type in sorted(missing))
    return errors, covered


def coverage_errors(root: Path, pages: list[Path], schema: Schema) -> list[str]:
    log = root / "wiki/log.md"
    if not log.is_file():
        return []
    text = log.read_text(encoding="utf-8")
    blocks = re.split(r"(?=^## )", text, flags=re.M)
    errors, latest = [], {}
    for block in blocks:
        if not INGEST_HEADING_RE.match(block):
            continue
        disposition = LOG_DISPOSITION_RE.search(block)
        if disposition and disposition.group(1) == "No material":
            continue
        raw_values = LOG_RAW_RE.findall(block)
        if len(raw_values) != 1:
            errors.append("ingest entry must declare exactly one Raw path")
            continue
        raw = (root / raw_values[0]).resolve()
        if not raw.is_file() or not raw.is_relative_to((root / "raw").resolve()):
            errors.append(f"ingest entry has invalid Raw path {raw_values[0]}")
            continue
        table_errors, covered = coverage_table_errors(block, raw, root, schema)
        errors.extend(table_errors)
        latest[raw] = covered
    for raw, covered in latest.items():
        grounded = {page.resolve() for page in pages if raw in page_raw_targets(page)}
        for page in sorted(grounded - covered):
            errors.append(f"coverage table for {raw.relative_to(root)} omits grounded page {page.relative_to(root)}")
    return errors


def main(argv: list[str]) -> int:
    strict, args = "--strict" in argv, [arg for arg in argv[1:] if arg != "--strict"]
    root = Path(args[0]).resolve() if args else Path.cwd()
    schema_path = root / "wiki" / "schema.md"
    if not schema_path.is_file():
        print(f"no workflow wiki/schema.md under {root}")
        return 1
    try:
        schema = load_schema(schema_path)
    except ValueError as error:
        print(f"invalid schema: {error}")
        return 1
    pages = content_pages(root / "wiki")
    findings: dict[Path | None, list[str]] = {page: check_page(page, root, schema) for page in pages}
    findings[None] = schema_errors(schema) + duplicate_entities(pages, root) + index_errors(root, pages) + coverage_errors(root, pages, schema)
    issues = sum(len(errors) for errors in findings.values())
    print("# Schema check")
    for page, errors in findings.items():
        if errors:
            print(f"\n{page.relative_to(root) if page else 'wiki/schema.md, wiki/index.md and entity registry'}")
            print("\n".join(f"- {error}" for error in errors))
    if not issues:
        print("\n(none)")
    print(f"\n## Summary\n{issues} schema issue(s)")
    return 1 if strict and issues else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

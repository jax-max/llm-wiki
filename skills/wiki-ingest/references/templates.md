# Ingest Templates

## Raw source

```markdown
# {Title}

> Source: {URL or origin}
> Collected: {YYYY-MM-DD}
> Published: {YYYY-MM-DD or Unknown}

{faithful source content}
```

## Typed-page metadata

```markdown
# {Title}

> Type: {Entity | Workflow | Rule | StateMachine | Event}
> Raw: [{source}](../../../../raw/{source-domain}/{file}.md)
> Updated: {YYYY-MM-DD}

```

Use the metadata block on every typed page. Add one `> Raw:` line per source
when a page is grounded in multiple files. Domain is inferred from the path.
`Aliases` and `Sources` may be added when useful. `Updated` is required: write
today's date every time a page is created or recompiled, and it must not
predate the latest ingest of any linked Raw (the evidence checker verifies
this).

## Entity

```markdown
## Overview

{definition, boundary, and grounded synthesis}

## Relations

- {schema-allowed-verb}: [{Target}](relative-path.md)
```

## Workflow

```markdown
## Overview

{purpose, trigger, and outcome}

## Steps

1. {ordered step, with links to participating pages where useful}
2. {next step}

## Relations

- uses: [{Target}](relative-path.md)
```

## Rule

```markdown
## Overview

{business purpose and scope}

## Rule

{decision logic, constraint, formula, strategy, or algorithm}

## Relations

- governs: [{Target}](relative-path.md)
```

## StateMachine

```markdown
## Overview

{the entity lifecycle modeled by this state machine}

## States

| State | Meaning |
|---|---|
| {state} | {meaning} |

## Transitions

| From | Trigger | Guard | To |
|---|---|---|---|
| {state} | {trigger} | {condition or None} | {state} |

## Relations

- state-machine-of: [{Entity}](relative-path.md)
```

## Event

```markdown
## Overview

{business-significant occurrence, trigger, participants, and outcome}

## Relations

- occurred-in: [{Entity}](relative-path.md)
```

Use an Event page for a domain event type when the source describes a meaningful
business occurrence. Add an instance only when the source provides its concrete
time, participants, or context; do not invent either.

For pages under `domains/<domain>/<type>/`, Raw links ascend from the page to
the project root as `../../../../raw/...`. Always calculate relative paths from
the actual page rather than copying this example blindly.

## Log entry

```markdown
## [YYYY-MM-DD] ingest | {primary page title}
- Disposition: New | Update | Disputed
- Raw: raw/{source-domain}/{file}.md
- SHA-256: {hexdigest of the saved raw file, computed at ingest time}
- Pages: wiki/domains/{domain}/{type}/{page}.md

### Coverage

| Type | Disposition | Pages or rationale |
|---|---|---|
| Entity | Added | [{page}](domains/{domain}/entities/{page}.md) |
| Workflow | Reused | [{page}](domains/{domain}/workflows/{page}.md) |
| Rule | N/A | The source defines no standalone decision mechanism. |
| StateMachine | N/A | The source describes no lifecycle states or transitions. |
| Event | Updated | [{page}](domains/{domain}/events/{page}.md) |
```

Use every Page Type declared in `wiki/schema.md`, not only the five rows shown
above. `Added`, `Updated`, and `Reused` require one or more typed-page links;
`N/A` requires a source-grounded rationale. The latest Coverage table for a
Raw must list every current page grounded in it.

When the source yields no durable knowledge, log a no-material entry whose
heading names the raw path (the evidence checker's inventory sweep exempts
only this heading form). It needs no `- SHA-256:` line: the file was never
compiled:

```markdown
## [YYYY-MM-DD] ingest | no material: raw/{source-domain}/{file}.md
- Disposition: No material
```

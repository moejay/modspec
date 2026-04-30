---
name: cli-commands
description: Subcommand handlers that surface spec/feature data for agent and human consumption — list, show, features, deps, validate
group: interface
tags: [cli, commands, output]
depends_on:
  - name: arg-parser
    uses: [subcommand-parsing]
  - name: spec-parser
    uses: [directory-parsing]
  - name: feature-parser
    uses: [directory-parsing]
features: features/cli-commands/
---

# CLI Commands

Five read-only subcommands that let humans and coding agents explore a modspec project without spinning up the dev server. Each handler takes parsed CLI options and emits to stdout. None touch the dev server, the file watcher, or `process.exit` directly — exit codes flow back through the orchestrator.

Implemented in `src/commands.js`. Every command supports `--json` for machine-readable output; default output is concise human-readable text.

## Commands

### `list`
Print all specs as a table. Columns: index, name, group, dep count, feature count. Sort by group then name.

JSON output: array of `{ name, group, description, tags, dependsOn, features: [{name, scenarios}], specPath }` objects. Stable order matches text output.

### `show <name>`
Print one spec's full info: name, description, group, tags, body, forward deps (with `uses`), reverse deps (who depends on this), each feature with its scenarios and path, the spec file's path.

JSON output: a single object containing all of the above. Errors with non-zero exit if `<name>` does not match any spec (case-insensitive).

### `features [<spec>]`
List features. With no spec name: every feature grouped by owning spec. With a spec name: only that spec's features. Each feature line shows name, scenario count, and path.

JSON output: array of `{ spec, feature, scenarios: [name], path }` objects.

### `deps <name>`
Show the dependency neighborhood of a spec. Two sections: forward (specs this spec depends on, transitive) and reverse (specs that depend on this spec, transitive). Edge labels show `uses` references when present.

JSON output: `{ dependsOn: [{name, uses}], dependents: [{name, uses}] }` flattened to the transitive closure. Errors with non-zero exit if `<name>` does not match.

### `validate`
Lint the spec graph. Surfaces:

- Broken `depends_on` references (spec name not found)
- Broken `uses` references (feature name not declared by the parent spec)
- Orphan `features:` paths (declared in frontmatter but directory missing)
- Specs that declare no features at all (warning, not error)
- Cycles (delegated to `src/cycles.js`)

Default output: grouped by severity, one issue per line with file path and message. Exit code is non-zero when any errors are present.

JSON output: `{ ok: boolean, issues: [{ severity, type, spec, message, path? }] }`.

## Stability and side effects

Pure functions where possible — handlers receive a parsed `specs` array and `options`, return a string (text or JSON). The orchestrator owns `console.log` and `process.exit`. This keeps the handlers testable in isolation and reusable from a future programmatic API.

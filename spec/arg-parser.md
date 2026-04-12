---
name: arg-parser
description: Pure CLI argument parser — extracts flags, positional args, and mode from process.argv
group: interface
tags: [cli, args, parsing]
depends_on: []
features: features/arg-parser/
---

# Arg Parser

Stateless function (`parseCliArgs`) that takes a raw argument array and returns a structured options object. Has zero dependencies — no framework, no external library, no I/O.

Implemented in `src/cli.js` (44 lines). Supports:

- **Positional argument**: first non-flag arg becomes `specDir`
- **`--output` / `-o`**: switches mode to `static`, captures output file path
- **`--port`**: custom port number for dev server (default 3333)
- **`-y` / `--yes`**: auto-confirm directory creation prompts
- **`--help` / `-h`**: help flag (also triggers when no args given)
- **Error reporting**: returns `{ error }` for invalid flag usage (e.g., `--output` without a path)

Returns a plain object — never throws, never reads the filesystem, never calls `process.exit`. All side effects (printing help, exiting) happen in the orchestrator.

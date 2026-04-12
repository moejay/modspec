---
name: orchestrator
description: CLI entry point — wires together parsing, generation, serving, and version checking
group: interface
tags: [cli, entry-point, node, orchestration]
depends_on:
  - name: arg-parser
    uses: [argument-parsing]
  - name: spec-parser
    uses: [directory-parsing]
  - name: graph-generator
    uses: [html-generation]
  - name: http-server
    uses: [server-lifecycle]
  - name: version-checker
    uses: [update-check]
features: features/orchestrator/
---

# Orchestrator

The executable entry point (`bin/modspec.js`, 134 lines). This is the only module that touches `process.argv`, `process.exit`, and `process.stdin`. It owns all top-level side effects.

Responsibilities:

1. **Parse arguments** via arg-parser, then branch on help/error/mode
2. **Ensure spec directory exists** — prompts interactively via `readline`, or auto-creates with `-y`
3. **Parse specs** by calling spec-parser with `projectRoot` derived from spec directory's parent
4. **Route to mode**:
   - **Dev server** (default): delegates to http-server, registers `SIGINT`/`SIGTERM` for graceful shutdown
   - **Static export** (`--output`): calls graph-generator, writes HTML to file or opens temp file in browser via `open` package
5. **Kick off version check** non-blocking on startup (`checkForUpdate().catch(() => {})`)

Uses Node built-ins: `fs/promises`, `os`, `path`, `readline`. The `open` npm package is dynamically imported only in static export mode.

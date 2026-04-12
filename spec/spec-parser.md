---
name: spec-parser
description: Parses markdown spec files with YAML frontmatter into normalized spec objects
group: foundation
tags: [parser, markdown, yaml, gray-matter]
depends_on:
  - name: feature-parser
    uses: [directory-parsing]
features: features/spec-parser/
---

# Spec Parser

Core data ingestion for spec files. Reads `.md` files, extracts YAML frontmatter via `gray-matter`, and produces normalized JavaScript objects.

Implemented in `src/parser.js` — the `parseSpecFile` and `parseSpecDirectory` exports. Also the library's `main` entry point in `package.json`, usable programmatically.

### Spec file contract

A valid spec file requires a `name` field in frontmatter. Optional fields: `description`, `group`, `tags` (array), `depends_on` (array), `features` (path string). Everything below the frontmatter fence is the markdown `body`.

### Dependency normalization

`depends_on` entries are polymorphic — the parser normalizes both formats to canonical `{ name: string, uses: string[] }`:

```yaml
# Simple string → { name: "config", uses: [] }
depends_on:
  - config

# Object with uses → { name: "auth", uses: ["token-validation", "session-management"] }
depends_on:
  - name: auth
    uses: [token-validation, session-management]
```

Invalid entries (no `name`) are filtered out. Dependency matching is case-insensitive.

### Directory parsing

`parseSpecDirectory(dirPath, { projectRoot })` scans for all `.md` files, parses each, skips files without `name`, then resolves feature files for each spec by delegating to the feature-parser with `projectRoot`-relative paths.

# modspec

Markdown-driven spec files with dependency graphs, feature tracking, and group clustering — visualized as an interactive, explorable graph.

## What is modspec?

modspec lets you define project specs as simple markdown files with YAML frontmatter. Each spec declares its name, dependencies, group, tags, and an optional path to Gherkin `.feature` files. Specs are composable modules — child specs declare which features they use from parent specs, creating traceable contracts between modules. modspec renders everything as a live, interactive dependency graph in the browser.

## Install

```bash
npm install -g @moejay/modspec
```

Or run directly:

```bash
npx @moejay/modspec ./spec/
```

## Skills

modspec ships with skills for spec authoring and brownfield adoption. Install them with:

```bash
npx skills install moejay/modspec
```

This installs two skills:

- **modspec** — helps you create and maintain spec files, dependencies, and feature files
- **modspec-init** — analyzes an existing codebase and generates specs + features from it (brownfield adoption)

## Quick start

### 1. Create a spec directory

```
myproject/
├── spec/
│   ├── bootstrap.md
│   ├── persistence.md
│   └── repos.md
└── features/
    ├── bootstrap/
    │   ├── project-scaffolding.feature
    │   └── health-endpoint.feature
    ├── persistence/
    │   ├── data-storage.feature
    │   └── query-interface.feature
    └── repos/
        └── repo-onboarding.feature
```

### 2. Write a spec file

Each spec is a markdown file with YAML frontmatter:

```markdown
---
name: bootstrap
description: One-time project scaffolding
group: foundation
tags: [setup, init]
depends_on: []
features: features/bootstrap/
---

# Bootstrap

This is the bootstrap spec. Any markdown content goes here —
it renders in the side panel when you click a node.
```

### 3. Declare dependencies with feature tracking

Specs declare which features they use from their dependencies:

```markdown
---
name: persistence
description: SQLite database layer
group: infrastructure
tags: [database, storage]
depends_on:
  - name: bootstrap
    uses: [project-scaffolding, health-endpoint]
features: features/persistence/
---
```

The `uses` array references `Feature:` names from the parent spec's `.feature` files. This creates a traceable contract — you know exactly which capabilities each module relies on.

#### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for the spec |
| `description` | No | Short summary shown in the info panel |
| `group` | No | Logical grouping — specs in the same group are visually clustered |
| `tags` | No | Array of tags for categorization |
| `depends_on` | No | Dependencies — simple strings or objects with `name` and `uses` |
| `features` | No | Path to a directory of `.feature` files |

#### `depends_on` format

Simple (backwards compatible):
```yaml
depends_on:
  - bootstrap
  - config
```

Rich (with feature references):
```yaml
depends_on:
  - name: bootstrap
    uses: [project-scaffolding]
  - name: persistence
    uses: [data-storage, query-interface]
```

Mixed:
```yaml
depends_on:
  - name: persistence
    uses: [data-storage]
  - server-api
```

### 4. Write Gherkin features

Feature names must be **kebab-case**:

```gherkin
Feature: project-scaffolding
  The project compiles and all tooling works from a fresh checkout.

  Scenario: Clean build with zero warnings
    Given a fresh clone of the repository
    When I run the build command
    Then the build succeeds
```

### 5. Run modspec

```bash
# Start the dev server (default: http://localhost:3333)
npx @moejay/modspec ./spec/

# Auto-create the spec directory
npx @moejay/modspec ./spec/ -y

# Custom port
npx @moejay/modspec ./spec/ --port 4000

# Export a static HTML file instead
npx @moejay/modspec ./spec/ --output graph.html
```

## Features

- **Interactive graph** — D3 force-directed dependency visualization with zoom, pan, and drag
- **Group clustering** — Specs in the same group are visually clustered with colored hulls
- **Feature tracking** — See which features flow along each dependency edge
- **Three layout modes** — Force (physics-based), Tree (top-down hierarchy), Manual (free positioning)
- **Side panel** — Click any node to see description, group, tags, dependencies with used features, rendered markdown body, and Gherkin scenarios
- **Composable specs** — Specs are modules with clear interfaces defined by their features
- **Live reload** — Dev server watches your spec and feature files, pushes changes via SSE instantly
- **Inline editing** — Edit spec bodies and feature files directly in the browser (dev server mode)
- **Static export** — Generate a self-contained HTML file with `--output`
- **Version check** — Notifies you when a new version is available

## CLI reference

```
npx @moejay/modspec <directory>                   Start dev server with live reload (default)
npx @moejay/modspec <directory> --output <file>   Save graph to a static HTML file
npx @moejay/modspec <directory> --port <number>   Custom port for dev server (default: 3333)
npx @moejay/modspec <directory> -y                Auto-create spec directory if missing
npx @moejay/modspec --help                        Show help
```

## Brownfield adoption

Already have a codebase? Install the skills (`npx skills install moejay/modspec`) and use `modspec-init` to analyze your existing code and generate spec + feature files automatically. It identifies modules, their dependencies, and public interfaces from your project structure and import patterns.

## License

MIT

# modspec

Markdown-driven spec files with dependency graphs and Gherkin features — visualized as an interactive, explorable graph.

## What is modspec?

modspec lets you define project specs as simple markdown files with YAML frontmatter. Each spec declares its name, description, dependencies, and an optional path to Gherkin `.feature` files. modspec then renders everything as a live, interactive dependency graph in the browser.

## Install

```bash
npm install -g modspec
```

Or run directly:

```bash
npx modspec ./spec/
```

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
    │   └── scaffolding.feature
    └── repos/
        └── onboarding.feature
```

### 2. Write a spec file

Each spec is a markdown file with YAML frontmatter:

```markdown
---
name: Bootstrap
description: One-time project scaffolding
depends_on: []
features: features/bootstrap/
---

# Bootstrap

This is the bootstrap spec. Any markdown content goes here —
it renders in the side panel when you click a node.
```

#### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for the spec |
| `description` | No | Short summary shown in the info panel |
| `depends_on` | No | Array of spec names this depends on |
| `features` | No | Path to a directory of `.feature` files |

### 3. Write Gherkin features

```gherkin
Feature: Project Scaffolding
  The project compiles and all tooling works from a fresh checkout.

  Scenario: Clean build with zero warnings
    Given a fresh clone of the repository
    When I run the build command
    Then the build succeeds
```

### 4. Run modspec

```bash
# Start the dev server (default: http://localhost:3333)
modspec ./spec/

# Custom port
modspec ./spec/ --port 4000

# Export a static HTML file instead
modspec ./spec/ --output graph.html
```

## Features

- **Interactive graph** — D3 force-directed dependency visualization with zoom, pan, and drag
- **Three layout modes** — Force (physics-based), Tree (top-down hierarchy), Manual (free positioning)
- **Side panel** — Click any node to see its description, dependencies, rendered markdown body, and feature scenarios
- **Gherkin integration** — Feature files are parsed and displayed with full scenario steps (Given/When/Then)
- **Live reload** — Dev server watches your spec and feature files, pushes changes via SSE instantly
- **Inline editing** — Edit spec bodies and feature files directly in the browser (dev server mode)
- **Static export** — Generate a self-contained HTML file with `--output`

## CLI reference

```
modspec <directory>                   Start dev server with live reload (default)
modspec <directory> --output <file>   Save graph to a static HTML file
modspec <directory> --port <number>   Custom port for dev server (default: 3333)
modspec --help                        Show help
```

## License

MIT

---
name: modspec
description: Create and structure modspec specification files with YAML frontmatter and Gherkin feature files. Use when building, editing, or organizing project specs and their dependency graphs.
license: MIT
metadata:
  author: modspec
  version: "1.0"
---

# modspec — Specification Authoring

You are helping the user create and maintain modspec specification files. modspec uses markdown files with YAML frontmatter to define project specs, their dependencies, and links to Gherkin `.feature` files. These specs are visualized as an interactive dependency graph.

## Project structure

A typical modspec project looks like this:

```
project/
├── spec/                    # Spec directory (passed to modspec CLI)
│   ├── bootstrap.md
│   ├── persistence.md
│   ├── auth.md
│   └── repos.md
├── features/                # Gherkin feature files (referenced from specs)
│   ├── bootstrap/
│   │   ├── scaffolding.feature
│   │   └── health.feature
│   ├── auth/
│   │   └── login.feature
│   └── repos/
│       └── onboarding.feature
└── package.json
```

## Writing spec files

Each spec is a `.md` file inside the spec directory. It has YAML frontmatter and an optional markdown body.

### Frontmatter fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | **Yes** | `string` | Unique identifier. This is how other specs reference it in `depends_on`. |
| `description` | No | `string` | Short summary. Shown in the graph info panel. |
| `depends_on` | No | `string[]` | Array of spec names this spec depends on. Creates directed edges in the graph. Case-insensitive matching. |
| `features` | No | `string` | Relative path to a directory containing `.feature` files for this spec. |

A file without a `name` field is silently skipped.

### Minimal spec

```markdown
---
name: Bootstrap
---
```

### Full spec

```markdown
---
name: Persistence
description: SQLite database layer for local storage
depends_on:
  - bootstrap
features: features/persistence/
---

# Persistence

This spec covers the database abstraction layer.

## Decisions

- Use SQLite for local-first storage
- Migrations managed via versioned SQL files

## API surface

- `db.get(key)` / `db.set(key, value)`
- `db.migrate()` — run pending migrations
```

The markdown body renders in the side panel when a user clicks the node in the graph. Use it for design rationale, API notes, decisions, or anything useful.

### Dependency rules

- `depends_on` entries are matched **case-insensitively** against other specs' `name` fields.
- If a dependency references a name that doesn't exist, it is silently ignored (no edge drawn).
- Circular dependencies are allowed but will create cycles in the graph.
- Root specs (no dependencies) appear at the top in tree layout.

### Example dependency chain

```
bootstrap.md:   depends_on: []
persistence.md: depends_on: [bootstrap]
auth.md:        depends_on: [bootstrap]
repos.md:       depends_on: [persistence, auth]
```

This creates a diamond-shaped graph: bootstrap at the root, persistence and auth in the middle, repos at the bottom.

## Writing Gherkin feature files

Feature files use standard Gherkin syntax. They live in the directory referenced by the spec's `features` field.

### Structure of a `.feature` file

```gherkin
@optional-tag
Feature: Feature Name
  Optional description text on the line(s) below.

  Scenario: First scenario name
    Given some precondition
    When an action is performed
    Then an expected outcome occurs
    And another assertion

  Scenario: Second scenario name
    Given a different setup
    When something else happens
    Then verify the result
```

### Rules

- One `Feature:` declaration per file (the first one found is used as the feature name).
- Each `Scenario:` starts a new scenario. The name is everything after `Scenario: `.
- Steps use keywords: `Given`, `When`, `Then`, `And`, `But`. These are displayed as scenario details in the graph UI.
- Tags (lines starting with `@`) are preserved in the raw content but not parsed separately.
- File must have a `.feature` extension to be picked up.

### Naming conventions

- Name feature files after what they test: `scaffolding.feature`, `login.feature`, `onboarding.feature`.
- Group features in subdirectories matching the spec name: `features/auth/`, `features/repos/`.
- Keep scenarios focused — one behavior per scenario.

### Good scenario example

```gherkin
Feature: User Authentication
  Verify login and session management.

  Scenario: Successful login with valid credentials
    Given a registered user with email "user@example.com"
    When the user submits valid credentials
    Then a session token is returned
    And the response status is 200

  Scenario: Rejected login with wrong password
    Given a registered user with email "user@example.com"
    When the user submits an incorrect password
    Then the response status is 401
    And no session token is returned
```

## Running modspec

```bash
# Dev server with live reload (default)
modspec ./spec/

# Custom port
modspec ./spec/ --port 4000

# Static HTML export
modspec ./spec/ --output graph.html
```

The dev server watches spec and feature files for changes, pushing updates to the browser in real time. Specs and features can be edited inline in the browser UI.

## Common tasks

### Adding a new spec
1. Create a new `.md` file in the spec directory.
2. Add frontmatter with at least a `name` field.
3. Add `depends_on` to wire it into the graph.
4. Optionally create a features directory and reference it.

### Adding a new feature
1. Create a `.feature` file in the spec's features directory.
2. Add a `Feature:` line and one or more `Scenario:` blocks with steps.
3. The dev server picks it up automatically.

### Reorganizing dependencies
- Edit the `depends_on` arrays in the relevant spec files.
- The graph updates live in the browser.

---
name: modspec
description: Create and structure modspec specification files with YAML frontmatter, Gherkin feature files, and composable dependency graphs. Use when building, editing, or organizing project specs and their dependency graphs.
license: MIT
metadata:
  author: modspec
  version: "1.1"
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
│   │   ├── project-scaffolding.feature
│   │   └── health-endpoint.feature
│   ├── auth/
│   │   └── user-login.feature
│   └── repos/
│       └── repo-onboarding.feature
└── package.json
```

## Writing spec files

Each spec is a `.md` file inside the spec directory. It has YAML frontmatter and an optional markdown body.

### Frontmatter fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | **Yes** | `string` | Unique identifier. This is how other specs reference it in `depends_on`. |
| `description` | No | `string` | Short summary. Shown in the graph info panel. |
| `group` | No | `string` | Logical grouping. Specs in the same group are visually clustered in the graph. |
| `tags` | No | `string[]` | Tags for filtering and categorization. |
| `depends_on` | No | `array` | Dependencies. Supports both simple strings and objects with `uses` for feature references. |
| `features` | No | `string` | Relative path to a directory containing `.feature` files for this spec. |

A file without a `name` field is silently skipped.

### Minimal spec

```markdown
---
name: bootstrap
---
```

### Full spec

```markdown
---
name: persistence
description: SQLite database layer for local storage
group: infrastructure
tags: [database, storage]
depends_on:
  - name: bootstrap
    uses: [project-scaffolding, health-endpoint]
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

### Dependency format

`depends_on` supports two formats that can be mixed:

**Simple (just the spec name):**
```yaml
depends_on:
  - bootstrap
  - config
```

**Rich (with feature references via `uses`):**
```yaml
depends_on:
  - name: bootstrap
    uses: [project-scaffolding, health-endpoint]
  - name: persistence
    uses: [data-storage, query-interface]
```

**Mixed:**
```yaml
depends_on:
  - name: persistence
    uses: [data-storage]
  - server-api
```

The `uses` array references `Feature:` names declared in the parent spec's `.feature` files. This creates a traceable link between what a child spec needs and what the parent provides.

### Feature naming

Feature names **must be kebab-case** (e.g., `data-storage`, `user-login`, `health-endpoint`). This applies to:

- The `Feature:` declaration in `.feature` files: `Feature: data-storage`
- The `uses` references in `depends_on`

### Dependency rules

- `depends_on` entries are matched **case-insensitively** against other specs' `name` fields.
- If a dependency references a name that doesn't exist, it is silently ignored (no edge drawn).
- Circular dependencies are allowed but will create cycles in the graph.
- Root specs (no dependencies) appear at the top in tree layout.
- `uses` references appear as labels on dependency edges in the graph.

### Groups

Specs with the same `group` value are visually clustered in the graph with a colored hull behind them. Use groups to organize specs by domain (e.g., `infrastructure`, `data`, `api`, `ui`).

### Example dependency chain

```
bootstrap.md:   depends_on: []                              (group: foundation)
persistence.md: depends_on: [{name: bootstrap, uses: [...]}] (group: infrastructure)
auth.md:        depends_on: [{name: bootstrap, uses: [...]}] (group: infrastructure)
repos.md:       depends_on: [{name: persistence, uses: [...]}, {name: auth, uses: [...]}] (group: data)
```

This creates a diamond-shaped graph: bootstrap at the root, persistence and auth in the middle (clustered by group), repos at the bottom.

## Writing Gherkin feature files

Feature files use standard Gherkin syntax. They live in the directory referenced by the spec's `features` field. Feature names serve as the **interface** of a spec — other specs declare which features they depend on via `uses`.

### Structure of a `.feature` file

```gherkin
@optional-tag
Feature: feature-name-in-kebab-case
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
- Feature names must be **kebab-case**: `Feature: data-storage`, not `Feature: Data Storage`.
- Each `Scenario:` starts a new scenario. The name is everything after `Scenario: `.
- Steps use keywords: `Given`, `When`, `Then`, `And`, `But`. These are displayed as scenario details in the graph UI.
- Tags (lines starting with `@`) are preserved in the raw content but not parsed separately.
- File must have a `.feature` extension to be picked up.
- Feature files should be named to match their feature name: `data-storage.feature`.

### Naming conventions

- Name feature files after their feature: `data-storage.feature`, `user-login.feature`, `repo-onboarding.feature`.
- Group features in subdirectories matching the spec name: `features/auth/`, `features/repos/`.
- Keep scenarios focused — one behavior per scenario.

### Good feature file example

```gherkin
Feature: user-login
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

# Auto-create spec directory if it doesn't exist
modspec ./spec/ -y

# Custom port
modspec ./spec/ --port 4000

# Static HTML export
modspec ./spec/ --output graph.html
```

The dev server watches spec and feature files for changes, pushing updates to the browser in real time. Specs and features can be edited inline in the browser UI.

### CLI options

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Save the HTML file to the specified path instead of serving |
| `--port` | Port for the dev server (default: 3333) |
| `-y`, `--yes` | Auto-create the spec directory if it doesn't exist |
| `--help`, `-h` | Show help message |

## Common tasks

### Adding a new spec
1. Create a new `.md` file in the spec directory.
2. Add frontmatter with at least a `name` field.
3. Add `depends_on` to wire it into the graph.
4. Optionally add `group` and `tags`.
5. Optionally create a features directory and reference it.

### Adding a new feature
1. Create a `.feature` file in the spec's features directory.
2. Use kebab-case for the `Feature:` name: `Feature: my-new-feature`.
3. Add one or more `Scenario:` blocks with steps.
4. The dev server picks it up automatically.
5. Other specs can now reference this feature in their `uses` arrays.

### Declaring feature dependencies
1. Identify which features from a parent spec your spec depends on.
2. Use the rich `depends_on` format with `uses`:
   ```yaml
   depends_on:
     - name: parent-spec
       uses: [feature-a, feature-b]
   ```
3. The graph will show these feature names on the dependency edges.

### Reorganizing dependencies
- Edit the `depends_on` arrays in the relevant spec files.
- The graph updates live in the browser.

### Composing specs
Specs are designed to be composable modules. A spec's features are its public interface — other specs declare which features they use. This creates a clear contract between modules:

1. **Provider spec** declares features via `.feature` files
2. **Consumer spec** declares which features it needs via `uses`
3. The graph visualizes these contracts as labeled edges

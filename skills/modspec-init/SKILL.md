---
name: modspec-init
description: Generate modspec spec files and Gherkin features from an existing codebase. Use for brownfield adoption — analyze existing code structure and create specs that reflect the project's modules and their dependencies.
license: MIT
metadata:
  author: modspec
  version: "1.0"
---

# modspec-init — Brownfield Spec Generator

You are helping the user generate modspec specification files from an existing codebase. This is for **brownfield adoption** — the project already has code and you need to create specs that reflect its current structure.

## Goal

Analyze the existing codebase and generate:
1. **Spec files** (`.md` with YAML frontmatter) for each identifiable module
2. **Feature files** (`.feature` with Gherkin scenarios) for each module's public interface (optional)

## Process

### Step 1: Analyze the codebase

Examine the project structure to identify modules. Look for:

- **Package/directory boundaries**: `src/auth/`, `lib/database/`, `packages/api/`
- **Entry points**: `index.js`, `mod.rs`, `__init__.py`, `main.go`
- **Export patterns**: What does each module expose to others?
- **Import patterns**: What does each module consume from others?
- **Configuration boundaries**: Separate config, shared state, DI containers

### Step 2: Identify dependencies

For each module, determine:
- Which other modules it imports from or depends on
- Which specific functionality (features) it uses from each dependency
- Whether the dependency is direct or transitive

### Step 3: Identify features (public interface)

For each module, identify the features it provides — its public API surface:
- Exported functions, classes, or types
- HTTP endpoints it serves
- Events it emits
- Commands it handles
- Data it stores/retrieves

Name features in **kebab-case**: `user-login`, `data-storage`, `api-routing`.

### Step 4: Generate spec files

Create a spec directory (default: `spec/`) and generate one `.md` file per module:

```markdown
---
name: module-name
description: Brief description of what this module does
group: logical-group
tags: [relevant, tags]
depends_on:
  - name: other-module
    uses: [feature-a, feature-b]
features: features/module-name/
---

# Module Name

Brief description and any design notes.
```

### Step 5: Generate feature files (optional)

If the user requests features, create a `features/` directory with subdirectories per module:

```gherkin
Feature: feature-name-in-kebab-case
  Description of what this feature provides.

  Scenario: Key behavior description
    Given some precondition
    When an action occurs
    Then expected outcome
```

## Guidelines

### Module granularity

- **Right-sized**: Each spec should represent a meaningful unit that could be developed, tested, and reasoned about independently.
- **Not too granular**: Don't create a spec per file. Group related files into a single module spec.
- **Not too broad**: Don't lump unrelated concerns together. A "utils" spec is a code smell — break it into focused modules.

### Naming

- Spec names: **kebab-case**, matching the module/directory name where possible
- Feature names: **kebab-case**, describing the capability (e.g., `data-storage`, not `DatabaseClass`)
- File names: Match the spec/feature name (e.g., `data-storage.feature`, `auth.md`)

### Groups

Assign groups based on architectural layers or domains:
- `foundation` — bootstrap, config, shared utilities
- `infrastructure` — database, caching, messaging, storage
- `domain` — core business logic modules
- `api` — HTTP endpoints, GraphQL, gRPC
- `ui` — frontend components, pages, layouts
- Or use domain-specific groupings that match the project

### Feature identification heuristics

Look for these patterns to identify features:

| Pattern | Feature name suggestion |
|---------|----------------------|
| `export function createUser(...)` | `user-creation` |
| `router.get('/health', ...)` | `health-endpoint` |
| `class DatabasePool` with `query()`, `transaction()` | `query-execution`, `transaction-management` |
| `EventEmitter.emit('order.completed')` | `order-completion-events` |
| `migration files in db/migrations/` | `schema-migrations` |

### Dependency detection heuristics

| Pattern | Dependency type |
|---------|----------------|
| `import { db } from '../database'` | Direct: uses database module |
| `@Inject(AuthService)` | Direct: uses auth module |
| `fetch('/api/users')` | Indirect: uses API module (may not appear in imports) |
| Environment variables like `DATABASE_URL` | Infrastructure: depends on config |
| Shared types/interfaces | Structural: depends on types module |

### Example output

For a Node.js project with `src/auth/`, `src/database/`, `src/api/`, `src/config/`:

**spec/config.md:**
```markdown
---
name: config
description: Environment configuration and validation
group: foundation
tags: [config, env]
depends_on: []
features: features/config/
---

# Config

Loads and validates environment variables. Provides typed config to all modules.
```

**spec/database.md:**
```markdown
---
name: database
description: PostgreSQL connection pool and query interface
group: infrastructure
tags: [database, postgres]
depends_on:
  - name: config
    uses: [env-loading]
features: features/database/
---

# Database

Manages the PostgreSQL connection pool and provides a query interface.
```

**spec/auth.md:**
```markdown
---
name: auth
description: User authentication and session management
group: domain
tags: [auth, security]
depends_on:
  - name: database
    uses: [query-execution, transaction-management]
  - name: config
    uses: [env-loading]
features: features/auth/
---

# Auth

Handles user login, registration, and session token management.
```

**features/database/query-execution.feature:**
```gherkin
Feature: query-execution
  Execute SQL queries against the database.

  Scenario: Execute a SELECT query
    Given a connected database pool
    When I execute a SELECT query
    Then the query results are returned

  Scenario: Handle query errors gracefully
    Given a connected database pool
    When I execute an invalid query
    Then a descriptive error is returned
```

## Interactive workflow

1. Ask the user which directory to analyze (or use the current project root)
2. Present the identified modules and their dependencies for review
3. Ask if they want feature files generated too
4. Generate the files
5. Suggest running `modspec ./spec/` to visualize the result
6. Iterate — the user may want to adjust groupings, split/merge modules, or refine features

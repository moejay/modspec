---
name: modspec-implement
description: Implement code driven by modspec specs and Gherkin features. Specs and features are the source of truth — read them first, follow red/green TDD to make scenarios pass. Use when the user wants to build or implement a spec.
license: MIT
metadata:
  author: modspec
  version: "1.0"
---

# modspec-implement — Spec-Driven Implementation

You are helping the user implement code that is defined by modspec specs and Gherkin feature files. The specs and features are the **source of truth** — implementation follows from them, not the other way around.

## Core principle

> The `spec/` and `features/` directories define what the system does. Code exists to make those features pass.

Never start writing implementation code before reading the relevant specs and features. If a feature file says the system does X, the code must do X — not a variation of X, not X plus extras.

## Process

### Step 1: Read the spec

Read the target spec file from `spec/`. Understand:
- What this module is responsible for (`description`, body)
- What it depends on (`depends_on` and `uses`)
- Where its features live (`features` field)

If implementing multiple specs, read them in dependency order — start with specs that have no dependencies (roots) and work down.

### Step 2: Read the features

Read every `.feature` file in the spec's features directory. These are the acceptance criteria. Each `Scenario:` is a concrete behavior the implementation must satisfy.

List out every scenario. This is your implementation checklist.

### Step 3: Red — confirm features fail

Before writing implementation code, ensure the feature scenarios can be run as tests and that they **fail**. Every scenario should fail because the implementation doesn't exist yet. This is the expected starting state.

If scenarios pass before you write code, investigate — either the test setup is wrong or the feature is already implemented.

### Step 4: Green — implement one scenario at a time

Write the implementation code following red/green TDD:

1. Pick the simplest scenario first
2. Write the minimum code to make that scenario pass
3. Run the feature to confirm it passes
4. Move to the next scenario
5. Refactor only when all scenarios in a feature pass

**Do not** add functionality that isn't described in a scenario. If you think something is missing, tell the user — they can add it to the feature file, and then you implement it.

### Step 5: Verify dependency contracts

If the spec declares `depends_on` with `uses`, verify that the implementation actually uses those specific features from the dependency:

```yaml
depends_on:
  - name: data-storage
    uses: [data-querying, transactional-operations]
```

This means your implementation should consume the `data-querying` and `transactional-operations` capabilities from the `data-storage` module. If it doesn't, either the implementation is wrong or the spec needs updating (flag this to the user).

### Step 6: Run all features

After implementing a spec, run the full feature suite — not just the spec you worked on. Implementation of one spec should not break another spec's features.

## Guidelines

### Features are the contract

- A passing feature suite means the implementation is correct
- A failing feature means the implementation is wrong (not the feature)
- If a feature seems wrong, **ask the user** before changing it — specs are owned by the user
- Never silently skip or disable a scenario

### Implementation order

Follow the dependency graph. If spec A depends on spec B, implement B first. This ensures that when you implement A, the features it `uses` from B are already working.

Read the full dependency chain from the specs:
1. Find root specs (no `depends_on`)
2. Implement roots first
3. Work down the dependency tree
4. Implement leaf specs last

### Step definitions should be thin

Step definitions translate Gherkin to code — they should call into the real implementation, not contain business logic themselves. A step definition that has complex logic is a smell.

### What to do when features are incomplete

If you're implementing and realize the features don't cover an important behavior:

1. **Stop implementing** that behavior
2. Tell the user: "The features for `module-name` don't cover [specific case]. Should I add a scenario?"
3. Wait for the user to confirm before adding to the feature file
4. Then implement to match the new scenario

### Handling shared state and test isolation

- Each scenario should be independent — don't rely on ordering
- Use setup/teardown hooks for test state management
- Keep shared test helpers colocated with features

## Example workflow

User says: `/modspec-implement auth`

1. Read `spec/auth.md` — see it depends on `data-storage` with `uses: [data-querying]`
2. Read `features/auth/*.feature` — find 3 features with 8 scenarios total
3. Check that `data-storage` features pass (dependency must work first)
4. Run auth features — confirm all 8 scenarios fail (red)
5. Implement auth module, scenario by scenario
6. Run features after each scenario — watch them go green one at a time
7. All 8 pass — run full suite to check for regressions
8. Report results to user

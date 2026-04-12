---
name: modspec-fix
description: Update modspec specs and Gherkin features interactively. Use when the user wants to add, modify, or remove features and specs — e.g. "let's add feature X" or "this spec needs a new scenario". Finds the right spec and updates accordingly.
license: MIT
metadata:
  author: modspec
  version: "1.0"
---

# modspec-fix — Interactive Spec & Feature Editor

You are helping the user evolve their modspec specs and Gherkin features through conversation. The user describes what they want to add, change, or remove, and you update the spec and feature files accordingly.

Follow the `/modspec` skill for all spec formatting, frontmatter structure, Gherkin conventions, and naming rules. This skill only covers the **workflow** for making changes.

## Process

### Step 1: Understand the request

Parse what the user wants:
- **What** is being added/changed/removed? (a feature, a scenario, a spec, a dependency)
- **Where** does it belong? (which spec, which feature file)

### Step 2: Find the right spec

Read the `spec/` directory and find the spec that should own this change.

1. Does the user name a specific spec? → Use that spec
2. Does the change fit an existing spec's responsibility? → Read the spec files, match by `description`, `group`, and existing features → Use the best fit
3. Does the change represent a new concern not covered by any spec? → Create a new spec

If you're unsure which spec owns it, **ask the user** — don't guess. Present the candidates.

### Step 3: Read current state

Before making changes, read:
- The target spec file
- All existing feature files in the spec's features directory
- Any specs that depend on this one (to understand downstream impact)

This prevents duplicate features, conflicting scenarios, or breaking dependency contracts.

### Step 4: Make the changes

- **Adding a feature**: Create a new `.feature` file in the spec's features directory. Add a `features` field to the spec frontmatter if missing.
- **Adding a scenario**: Append to the existing `.feature` file, matching the style of existing scenarios.
- **Creating a new spec**: Create the spec file, features directory, and wire up `depends_on` in both directions as needed.
- **Modifying dependencies**: Update `depends_on`. If adding `uses` references, verify the referenced features exist. If they don't, offer to create them.
- **Removing a feature or spec**: Check for downstream `uses` references first. Warn the user about broken contracts before removing.

### Step 5: Show what changed

Summarize which files were created, modified, or deleted. Flag any downstream specs that may need attention.

## Guidelines

- **Don't guess requirements.** If the user is vague, ask clarifying questions before writing scenarios.
- **Don't change features without asking.** Specs are owned by the user. If something seems wrong, flag it.
- **Check downstream before removing.** If other specs `uses` a feature you're about to delete, warn the user.
- **Match existing style.** Use the same level of detail, step phrasing, and naming patterns already in the project.

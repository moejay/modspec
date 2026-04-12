---
name: skills
description: Claude Code SKILL.md definitions for spec authoring and brownfield codebase adoption
group: interface
tags: [skills, claude-code, ai-assisted, authoring]
depends_on:
  - name: spec-parser
    uses: [spec-format]
  - name: feature-parser
    uses: [feature-format]
features: features/skills/
---

# Skills

Claude Code skill files (`skills/*/SKILL.md`) that teach AI assistants the modspec file format and workflows. Shipped as part of the npm package (`"files": ["skills/"]`).

### modspec skill (`skills/modspec/SKILL.md`)

Day-to-day spec authoring guide. Covers:
- Spec file structure (YAML frontmatter fields, markdown body conventions)
- Dependency declaration with `depends_on` and `uses` feature references
- Feature file creation in Gherkin format
- Naming conventions (kebab-case for specs, features, files)
- Group assignment by architectural layer
- Common operations: add a module, add a dependency, create features, restructure groups

### modspec-init skill (`skills/modspec-init/SKILL.md`)

Brownfield adoption workflow. Guides AI through:
1. Analyzing existing codebase structure (package boundaries, import/export patterns)
2. Identifying modules at the right granularity (not per-file, not monolithic)
3. Detecting inter-module dependencies and mapping them to feature references
4. Generating spec and feature files
5. Optional interactive mode with user review at each step
6. Technology-agnostic abstraction (unless user explicitly requests tech stack preservation)

Both skills reference the canonical spec format that spec-parser and feature-parser consume, ensuring generated files are valid.

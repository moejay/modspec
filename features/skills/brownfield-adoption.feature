Feature: brownfield-adoption
  Analyze existing codebases and generate specs reflecting current module structure and dependencies.

  Scenario: Identify modules from project structure
    Given an existing codebase with directory and package boundaries
    When the modspec-init skill analyzes the project
    Then modules are identified based on entry points, export patterns, and configuration boundaries

  Scenario: Detect inter-module dependencies
    Given identified modules with import and injection relationships
    When dependencies are analyzed
    Then depends_on entries are generated mapping to specific feature uses

  Scenario: Generate specs at the right granularity
    Given the codebase has many files
    When modules are identified
    Then specs are right-sized — not per-file, not monolithic, not vague "utils" catch-alls

  Scenario: Technology-agnostic by default
    Given the user does not request tech stack preservation
    When specs are generated
    Then no language-specific terms, framework names, or implementation details appear

  Scenario: Preserve tech stack when requested
    Given the user explicitly asks to keep the tech stack
    When specs are generated
    Then technology-specific concepts and framework references are included

  Scenario: Interactive workflow
    Given the user specifies --interactive
    When the skill runs
    Then the user is prompted to review modules, dependencies, and feature generation at each step

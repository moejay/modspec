Feature: spec-authoring
  Guide AI assistants in creating and maintaining modspec-compatible spec files.

  Scenario: Create a new spec file
    Given the user asks to add a module spec
    When the modspec skill is invoked
    Then a .md file is created with valid YAML frontmatter (name, description, group, tags, depends_on, features) and a markdown body

  Scenario: Add dependency with feature references
    Given an existing spec needs a new dependency
    When the skill updates depends_on
    Then the entry includes target name and a uses array of feature names

  Scenario: Create Gherkin feature files
    Given the user wants to define a module's capabilities
    When the skill creates features
    Then .feature files with Feature header, description, and Scenario blocks are written

  Scenario: Apply naming conventions
    Given the skill generates spec or feature names
    When naming
    Then kebab-case is used for spec names, feature names, and file names

  Scenario: Assign architectural groups
    Given the skill categorizes a module
    When assigning a group
    Then it selects from foundation, infrastructure, domain, interface, presentation, or a project-specific grouping

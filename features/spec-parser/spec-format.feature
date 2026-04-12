Feature: spec-format
  Define the canonical spec file format consumed by the parser.

  Scenario: Valid frontmatter structure
    Given a markdown file following the modspec format
    When it is valid
    Then it has YAML frontmatter with name (required), description, group, tags, depends_on, features
    And a markdown body below the frontmatter fences

  Scenario: Mixed dependency formats in depends_on
    Given a spec lists dependencies as both strings and {name, uses} objects
    When the file is parsed
    Then all entries are normalized to the canonical { name: string, uses: string[] } shape

  Scenario: Case-insensitive dependency matching
    Given a spec depends_on "Auth" and another spec's name is "auth"
    When dependencies are resolved
    Then the dependency matches regardless of case

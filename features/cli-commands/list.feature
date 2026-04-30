Feature: list
  Print every spec as a sortable summary, suitable for humans (table) or agents (JSON).

  Scenario: Text output lists specs grouped by group, then name
    Given a spec directory with specs "auth", "persistence", "bootstrap"
      And "auth" and "persistence" share group "infrastructure"
      And "bootstrap" has group "foundation"
    When the list command runs without --json
    Then the output groups specs as "foundation" before "infrastructure"
      And within each group, specs appear sorted by name

  Scenario: Text output shows name, group, dep count, feature count
    Given a spec "auth" in group "infrastructure" with 2 dependencies and 3 features
    When the list command runs without --json
    Then the line for "auth" includes "auth", "infrastructure", "2 deps", "3 features"

  Scenario: JSON output emits an array of spec metadata
    Given a spec directory with two specs
    When the list command runs with --json
    Then the output is valid JSON containing an array of length 2
      And each entry has fields: name, group, description, tags, dependsOn, features, specPath

  Scenario: JSON spec entries include relative file paths
    Given a spec "auth" stored at "spec/auth.md"
    When the list command runs with --json
    Then the entry for "auth" has specPath "spec/auth.md"

  Scenario: JSON order matches text order
    Given multiple specs across multiple groups
    When the list command runs with --json
    Then the JSON array is ordered by group, then name

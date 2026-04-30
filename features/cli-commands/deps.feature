Feature: deps
  Print forward and reverse transitive dependencies for one spec.

  Scenario: Text output shows forward deps as a tree
    Given a chain "auth" depends on "persistence" depends on "bootstrap"
    When the deps command runs for "auth"
    Then forward deps include "persistence" and "bootstrap" with indentation showing depth

  Scenario: Text output shows reverse deps as a tree
    Given "repos" depends on "auth" and "audit" depends on "repos"
    When the deps command runs for "auth"
    Then reverse deps include "repos" and "audit" with indentation showing depth

  Scenario: Text output labels edges with uses references
    Given "auth" depends on "persistence" with uses "data-storage"
    When the deps command runs for "auth"
    Then the edge from "auth" to "persistence" is labeled "uses: data-storage"

  Scenario: JSON output returns flat transitive arrays
    Given a chain "auth" depends on "persistence" depends on "bootstrap"
    When the deps command runs for "auth" with --json
    Then the JSON object has fields "dependsOn" and "dependents"
      And dependsOn contains both "persistence" and "bootstrap"

  Scenario: Error when spec name not found
    Given a spec directory with no spec named "missing"
    When the deps command runs for "missing"
    Then an error is reported: "spec not found: missing"
      And the exit code is non-zero

  Scenario: A spec with no dependencies prints empty forward section
    Given a spec "bootstrap" with no depends_on
    When the deps command runs for "bootstrap"
    Then the forward deps section is empty or marked as none

Feature: show
  Print one spec's full information including forward deps, reverse deps, features, and body.

  Scenario: Text output includes spec metadata, body, and feature scenarios
    Given a spec "auth" with description "Auth module", group "infrastructure", body "# Auth\n...", and 1 feature with 2 scenarios
    When the show command runs for "auth" without --json
    Then the output includes the description, group, body, and each scenario name

  Scenario: Text output lists forward dependencies with uses
    Given a spec "auth" depending on "persistence" with uses "data-storage"
    When the show command runs for "auth" without --json
    Then the output lists "persistence" under forward deps with "uses: data-storage"

  Scenario: Text output lists reverse dependencies
    Given a spec "auth" and a spec "repos" that depends on "auth"
    When the show command runs for "auth" without --json
    Then the output lists "repos" under reverse deps

  Scenario: Spec name match is case-insensitive
    Given a spec named "Auth"
    When the show command runs for "auth" without --json
    Then the spec is found and its info is printed

  Scenario: Error when spec name not found
    Given a spec directory with no spec named "missing"
    When the show command runs for "missing"
    Then an error is reported: "spec not found: missing"
      And the exit code is non-zero

  Scenario: JSON output is a single object with all fields
    Given a spec "auth" with deps, dependents, and features
    When the show command runs for "auth" with --json
    Then the output is valid JSON
      And contains fields: name, description, group, tags, body, dependsOn, dependents, features, specPath

  Scenario: JSON features include scenarios and path
    Given a spec "auth" with one feature "user-login" containing 2 scenarios at "features/auth/user-login.feature"
    When the show command runs for "auth" with --json
    Then the features array contains an entry with name "user-login", 2 scenarios, and path "features/auth/user-login.feature"

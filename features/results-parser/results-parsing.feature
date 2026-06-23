Feature: results-parsing
  Parse a Cucumber JSON test report into a normalized feature/scenario status lookup.

  Scenario: Scenario passes when all steps pass
    Given a scenario whose steps all have status "passed"
    When deriveScenarioStatus is called
    Then the derived status is "passed"

  Scenario: Scenario fails when any step fails
    Given a scenario with steps having statuses ["passed", "failed", "passed"]
    When deriveScenarioStatus is called
    Then the derived status is "failed"

  Scenario: Status follows severity precedence
    Given a scenario with steps having statuses ["passed", "skipped", "pending"]
    When deriveScenarioStatus is called
    Then the derived status is "pending"

  Scenario: Scenario with no steps is undefined
    Given a scenario with an empty steps array
    When deriveScenarioStatus is called
    Then the derived status is "undefined"

  Scenario: Normalize a report into a feature and scenario lookup
    Given a Cucumber JSON report for feature "user-login" with a passing scenario "Successful login"
    When normalizeResults is called
    Then the lookup has feature "user-login" with scenario "Successful login" set to "passed"

  Scenario: Accept a JSON string as input
    Given the same report serialized as a JSON string
    When normalizeResults is called
    Then the lookup has feature "user-login" with scenario "Successful login" set to "passed"

  Scenario: Normalize a Jest/vitest JSON report
    Given a vitest JSON report with a passing "it" test "Successful login" under describe "user-login"
    When normalizeResults is called
    Then the lookup has feature "user-login" with scenario "Successful login" set to "passed"

  Scenario: Roll vitest-cucumber steps up to a scenario status
    Given a vitest report with steps under "Feature: user-login" and "Scenario: Bad password" where one step failed
    When normalizeResults is called
    Then the lookup has feature "user-login" with scenario "Bad password" set to "failed"

  Scenario: Missing results file returns null
    Given a path to a results file that does not exist
    When parseResultsFile is called
    Then the result is null

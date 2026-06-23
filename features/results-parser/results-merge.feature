Feature: results-merge
  Merge normalized test results onto the parsed spec model.

  Scenario: Annotate matching scenarios with their status
    Given a spec with a feature "user-login" containing scenario "Successful login"
    And a results lookup marking "Successful login" as "passed"
    When mergeResults is called
    Then the scenario "Successful login" has status "passed"

  Scenario: Scenario with no matching result gets null status
    Given a spec with a feature "user-login" containing scenario "Forgotten password"
    And a results lookup that has no entry for "Forgotten password"
    When mergeResults is called
    Then the scenario "Forgotten password" has status null

  Scenario: Compute feature-level rollup and counts
    Given a spec feature with scenarios statuses ["passed", "failed"]
    When mergeResults is called
    Then the feature testStatus is "failed"
    And the feature testCounts are passed 1 failed 1 total 2

  Scenario: Compute spec-level rollup across features
    Given a spec with one all-passing feature and one feature containing a failure
    When mergeResults is called
    Then the spec testStatus is "failed"

  Scenario: Spec with no matching results has null test status
    Given a spec whose scenarios have no entries in the results lookup
    When mergeResults is called
    Then the spec testStatus is null
    And the spec testCounts total is 0

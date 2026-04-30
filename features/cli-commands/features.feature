Feature: features
  List features either across the whole project or scoped to one spec.

  Scenario: Text output without spec name lists all features grouped by spec
    Given two specs "auth" and "persistence" each with features
    When the features command runs without a spec name
    Then the output groups features under "auth" and "persistence" headings

  Scenario: Text output with spec name lists only that spec's features
    Given a spec "auth" with two features and a spec "persistence" with one feature
    When the features command runs for spec "auth"
    Then only auth's two features are printed
      And persistence's feature is not printed

  Scenario: Text output shows feature name, scenario count, and path
    Given a spec "auth" with feature "user-login" containing 3 scenarios at "features/auth/user-login.feature"
    When the features command runs for spec "auth"
    Then the line for "user-login" includes "3 scenarios" and "features/auth/user-login.feature"

  Scenario: JSON output without spec name returns a flat array of all features
    Given two specs each with one feature
    When the features command runs with --json and no spec name
    Then the output is a valid JSON array of length 2
      And each entry has fields: spec, feature, scenarios, path

  Scenario: JSON output with spec name filters to that spec only
    Given two specs each with one feature
    When the features command runs with --json for spec "auth"
    Then the JSON array contains only the feature(s) belonging to "auth"

  Scenario: Error when scoped spec name not found
    Given a spec directory with no spec named "missing"
    When the features command runs for spec "missing"
    Then an error is reported: "spec not found: missing"
      And the exit code is non-zero

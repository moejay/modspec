Feature: validate
  Lint the spec graph for broken references, missing feature directories, and cycles.

  Scenario: Pass when graph is valid
    Given a spec directory where every depends_on resolves and every uses resolves
    When the validate command runs
    Then the output reports "ok"
      And the exit code is zero

  Scenario: Report broken depends_on reference
    Given a spec "auth" that depends on "missing-spec" which does not exist
    When the validate command runs
    Then an error issue is reported with type "broken-dependency"
      And the message names "auth" and "missing-spec"
      And the exit code is non-zero

  Scenario: Report broken uses reference
    Given a spec "auth" that uses feature "ghost-feature" from "persistence" but persistence has no such feature
    When the validate command runs
    Then an error issue is reported with type "broken-uses"
      And the message names "auth", "persistence", and "ghost-feature"

  Scenario: Report orphan features path
    Given a spec "auth" whose frontmatter declares features "features/auth/" but the directory does not exist
    When the validate command runs
    Then an error issue is reported with type "missing-features-dir"

  Scenario: Warn on spec with no features
    Given a spec "draft" with no features field and no .feature files
    When the validate command runs
    Then a warning issue is reported with type "no-features"
      And the exit code is still zero when only warnings are present

  Scenario: Report cycles detected by analyzeGraph
    Given a cycle where "a" depends on "b" and "b" depends on "a"
    When the validate command runs
    Then an error issue is reported with type "cycle"
      And the message names both "a" and "b"

  Scenario: JSON output structure
    Given a spec graph with one error and one warning
    When the validate command runs with --json
    Then the output is valid JSON
      And has fields: ok, issues
      And each issue has fields: severity, type, spec, message

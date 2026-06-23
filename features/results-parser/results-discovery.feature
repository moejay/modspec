Feature: results-discovery
  Locate a Cucumber JSON results file by explicit path or auto-detection.

  Scenario: Explicit path takes precedence and is resolved to absolute
    Given an explicit results path "out/my-report.json"
    When resolveResultsPath is called
    Then it returns that path resolved to an absolute path

  Scenario: Auto-detect a results file in a conventional directory
    Given a project containing "results/cucumber.json"
    And no explicit results path
    When resolveResultsPath is called
    Then it returns the path to "results/cucumber.json"

  Scenario: Root-level report is preferred over a directory report
    Given a project containing both "cucumber.json" and "results/cucumber.json"
    And no explicit results path
    When resolveResultsPath is called
    Then it returns the root-level "cucumber.json"

  Scenario: No recognized results file returns null
    Given a project with no recognized results files
    And no explicit results path
    When resolveResultsPath is called
    Then it returns null

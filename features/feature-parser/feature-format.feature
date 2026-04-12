Feature: feature-format
  Define the expected Gherkin feature file structure.

  Scenario: Feature header
    Given a .feature file
    When it follows Gherkin format
    Then it starts with "Feature: feature-name" followed by an optional description

  Scenario: Scenario blocks
    Given a feature file
    When scenarios are defined
    Then each starts with "Scenario: description" followed by Given/When/Then/And/But steps

  Scenario: Kebab-case naming convention
    Given feature files follow modspec conventions
    When named
    Then feature names and filenames use kebab-case (e.g., "data-querying.feature")

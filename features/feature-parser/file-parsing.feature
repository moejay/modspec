Feature: file-parsing
  Parse a single Gherkin .feature file into structured data.

  Scenario: Extract feature name from header
    Given a .feature file starting with "Feature: user-login"
    When parseFeatureFile is called
    Then name is "user-login"

  Scenario: Extract scenarios and steps
    Given a .feature file with two Scenario blocks containing Given/When/Then steps
    When parseFeatureFile is called
    Then scenarios is an array of two objects, each with name and steps array

  Scenario: Capture And/But steps
    Given a scenario contains "And" and "But" steps after Given/When/Then
    When parseFeatureFile is called
    Then the And/But lines are included in the scenario's steps array

  Scenario: Preserve raw content
    Given any .feature file
    When parseFeatureFile is called
    Then the content field contains the full file text unchanged

  Scenario: Compute relative path from basePath
    Given basePath is provided in options
    When parseFeatureFile is called
    Then path is the file's location relative to basePath

  Scenario: Return filename
    Given a file at /project/features/auth/login.feature
    When parseFeatureFile is called
    Then filename is "login.feature"

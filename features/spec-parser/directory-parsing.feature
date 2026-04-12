Feature: directory-parsing
  Parse all spec files in a directory and resolve their feature files.

  Scenario: Parse multiple spec files
    Given a directory with three .md files, two valid and one without name
    When parseSpecDirectory is called
    Then two spec objects are returned

  Scenario: Resolve feature files with projectRoot
    Given a spec has features: "features/auth/" and projectRoot is provided
    When parseSpecDirectory is called
    Then featureFiles is populated by parsing projectRoot/features/auth/*.feature

  Scenario: Empty featureFiles when no features path
    Given a spec has no features field
    When parseSpecDirectory is called
    Then featureFiles is an empty array

  Scenario: Handle directory with no .md files
    Given a directory with only non-.md files
    When parseSpecDirectory is called
    Then an empty array is returned

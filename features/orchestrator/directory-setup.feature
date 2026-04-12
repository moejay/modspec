Feature: directory-setup
  Ensure the spec directory exists before parsing, with interactive and auto-confirm flows.

  Scenario: Auto-create directory with -y flag
    Given the spec directory does not exist and -y was passed
    When the orchestrator starts
    Then the directory is created recursively without prompting

  Scenario: Prompt user to create missing directory
    Given the spec directory does not exist and -y was not passed
    When the orchestrator starts
    Then the user is prompted via readline to confirm creation

  Scenario: Abort when user declines creation
    Given the user answers "n" to the directory creation prompt
    When the response is processed
    Then the process exits with code 1 and message "Aborted."

  Scenario: Proceed with existing directory
    Given the spec directory already exists
    When the orchestrator starts
    Then no prompt is shown and parsing proceeds immediately

Feature: update-check
  Check npm registry for newer versions of @moejay/modspec.

  Scenario: Notify when update is available
    Given the current version is "0.2.1" and npm latest is "0.3.0"
    When checkForUpdate completes
    Then a message is logged: "Update available: 0.2.1 → 0.3.0"

  Scenario: Stay silent when up to date
    Given the current version matches the npm latest
    When checkForUpdate completes
    Then nothing is logged

  Scenario: Silently handle network errors
    Given the npm registry is unreachable
    When checkForUpdate runs
    Then no error is thrown and no output is produced

  Scenario: Abort after 3 seconds
    Given the registry response takes longer than 3 seconds
    When the AbortController fires
    Then the fetch is cancelled and the function resolves silently

  Scenario: Read current version from package.json
    Given src/version.js resolves package.json relative to its own directory
    When getCurrentVersion is called
    Then the version field from package.json is returned

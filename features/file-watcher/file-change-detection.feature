Feature: file-change-detection
  Detect changes to spec and feature files on disk.

  Scenario: Watch spec directory and feature directories
    Given specs reference feature directories
    When the watcher is initialized
    Then both the spec directory and all referenced feature directories are watched

  Scenario: React to .md file changes
    Given the watcher is running
    When a .md file is added, changed, or deleted
    Then a re-parse is triggered

  Scenario: React to .feature file changes
    Given the watcher is running
    When a .feature file is added, changed, or deleted
    Then a re-parse is triggered

  Scenario: Ignore non-spec files
    Given the watcher is running
    When a .js or .json file changes in a watched directory
    Then no re-parse is triggered

  Scenario: Debounce rapid changes
    Given multiple files change within 100ms
    When the debounce window expires
    Then only one re-parse and broadcast occurs

  Scenario: Ignore existing files on startup
    Given the watcher starts with ignoreInitial: true
    When existing files are discovered
    Then no file events are emitted

  Scenario: Polling mode for cross-filesystem compatibility
    Given the watcher is configured
    When watching begins
    Then usePolling is true with a 100ms interval

  Scenario: Rebuild spec file map on change
    Given a new .md file is added to the spec directory
    When the re-parse completes
    Then the spec name → file path map is rebuilt to include the new file

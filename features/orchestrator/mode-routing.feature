Feature: mode-routing
  Route to dev server or static export based on parsed CLI options.

  Scenario: Start dev server by default
    Given mode is "serve"
    When the orchestrator routes
    Then createModspecServer is called with specDir and port
    And SIGINT/SIGTERM handlers are registered for graceful shutdown

  Scenario: Static export to specified file
    Given mode is "static" and outputPath is "graph.html"
    When the orchestrator routes
    Then generateHTML is called and HTML is written to "graph.html"

  Scenario: Static export to temp file with browser open
    Given mode is "static" and outputPath is null
    When the orchestrator routes
    Then HTML is written to a temp directory and opened in the default browser via the open package

  Scenario: Exit when no specs found
    Given the spec directory contains no valid spec files
    When parsing completes
    Then a message is logged and the process exits with code 0

  Scenario: Log spec count on success
    Given the spec directory contains valid specs
    When parsing completes
    Then a message like "Found N spec(s): name1, name2" is logged

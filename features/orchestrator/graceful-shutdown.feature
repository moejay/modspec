Feature: graceful-shutdown
  Clean up resources on process signals.

  Scenario: Shut down on SIGINT
    Given the dev server is running
    When SIGINT is received
    Then server.close() is called which stops the watcher, closes SSE clients, and shuts down HTTP
    And the process exits with code 0

  Scenario: Shut down on SIGTERM
    Given the dev server is running
    When SIGTERM is received
    Then the same shutdown sequence runs as for SIGINT

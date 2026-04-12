Feature: server-lifecycle
  Start and stop the HTTP server with proper resource cleanup.

  Scenario: Start server on configured port
    Given port 3333 is specified
    When createModspecServer is called
    Then the server binds to port 3333 and returns { port, address, close }

  Scenario: Start server on random port
    Given port 0 is specified
    When createModspecServer is called
    Then the server binds to a random available port

  Scenario: Close server cleanly
    Given the server is running with active SSE clients and a file watcher
    When close() is called
    Then the debounce timer is cleared
    And the file watcher is closed
    And all SSE client responses are ended
    And the HTTP server stops accepting connections

  Scenario: Report server address
    Given the server starts successfully
    When the promise resolves
    Then address is "http://localhost:{port}"

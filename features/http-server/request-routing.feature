Feature: request-routing
  Route incoming HTTP requests to appropriate handlers.

  Scenario: Serve HTML on GET /
    Given the server is running
    When a GET request hits /
    Then the generated HTML is returned with Content-Type text/html and Cache-Control no-cache

  Scenario: Serve HTML on GET /index.html
    Given the server is running
    When a GET request hits /index.html
    Then the same HTML response as / is returned

  Scenario: Serve specs JSON on GET /api/specs
    Given the server is running
    When a GET request hits /api/specs
    Then the current parsed specs are returned as JSON

  Scenario: Return 404 for unknown routes
    Given the server is running
    When a GET request hits an unrecognized path
    Then 404 Not found is returned as text/plain

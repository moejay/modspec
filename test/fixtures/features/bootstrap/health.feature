Feature: Health Endpoint
  Verifies the health check endpoint is functional.

  Scenario: GET /health returns 200
    Given the server is running
    When I request GET /health
    Then the response status is 200

  Scenario: Health check includes uptime
    Given the server is running
    When I request GET /health
    Then the response body contains uptime

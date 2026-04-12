Feature: event-streaming
  Manage SSE connections and push spec updates to browsers.

  Scenario: Accept SSE connection
    Given a browser requests GET /api/events
    When the connection is established
    Then response headers are set for text/event-stream with keep-alive
    And an initial ": connected" comment is written
    And the response is added to the client set

  Scenario: Remove client on disconnect
    Given a browser is connected via SSE
    When the connection closes
    Then the response is removed from the client set

  Scenario: Broadcast update to all clients
    Given three browsers are connected via SSE
    When broadcastUpdate is called with new specs
    Then all three receive a data: frame with the serialized specs JSON

  Scenario: Handle broken client gracefully
    Given a client connection has broken
    When broadcastUpdate writes to it and fails
    Then the client is silently removed from the set

  Scenario: Close all clients on shutdown
    Given active SSE connections exist
    When close() is called
    Then every client response is ended and the set is cleared

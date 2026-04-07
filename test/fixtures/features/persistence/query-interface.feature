Feature: query-interface
  Query builder and execution for stored data.

  Scenario: Query by field value
    Given entities with various field values
    When I query where field equals "active"
    Then only matching entities are returned

  Scenario: Query with limit
    Given 10 stored entities
    When I query with limit 3
    Then exactly 3 entities are returned

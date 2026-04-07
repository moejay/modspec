Feature: data-storage
  CRUD operations for persistent entities.

  Scenario: Store and retrieve an entity
    Given an empty data store
    When I store entity "foo" with value "bar"
    Then retrieving "foo" returns "bar"

  Scenario: Delete an entity
    Given entity "foo" exists
    When I delete "foo"
    Then retrieving "foo" returns nothing

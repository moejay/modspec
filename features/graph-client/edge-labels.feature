Feature: edge-labels
  Show feature-use labels on dependency links.

  Scenario: Toggle edge labels on
    Given the graph has dependency links with uses arrays
    When the user toggles edge labels on
    Then feature names from the uses array are displayed on the link lines

  Scenario: Toggle edge labels off
    Given edge labels are currently visible
    When the user toggles edge labels off
    Then labels are hidden

  Scenario: Links without uses show no label
    Given a dependency has an empty uses array
    When edge labels are toggled on
    Then that link shows no label text

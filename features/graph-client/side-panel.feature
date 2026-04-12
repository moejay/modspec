Feature: side-panel
  Slide-in panel showing spec details and feature files on node click.

  Scenario: Open panel on node click
    Given the graph is rendered with nodes
    When the user clicks a node
    Then a side panel slides in from the right

  Scenario: Show spec body as rendered markdown
    Given the panel is open for a spec with a markdown body
    When the Spec tab is active
    Then the body is rendered as HTML via marked.js

  Scenario: Show feature files with collapsible scenarios
    Given the spec has associated .feature files
    When the Features tab is active
    Then each feature file is listed with expandable/collapsible scenarios and steps

  Scenario: Close panel
    Given the panel is open
    When the user clicks the close button or clicks on the background
    Then the panel slides out

  Scenario: Show spec metadata
    Given the panel is open
    When viewing spec details
    Then name, description, group, tags, and dependencies are displayed

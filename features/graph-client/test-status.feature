Feature: test-status
  Visualize merged test results on the graph and in the side panel.

  Scenario: Node ring reflects spec test status
    Given a spec node carrying a testStatus
    When the graph is rendered
    Then the node circle is outlined in the status colour (green pass, red fail, amber otherwise)

  Scenario: Node shows a passed-over-total count
    Given a spec node carrying testCounts
    When the graph is rendered
    Then the node displays its passed/total scenario count inside the circle

  Scenario: No-data nodes keep their default appearance
    Given a spec node with no testStatus
    When the graph is rendered
    Then the node circle keeps its depth-based stroke with no status ring

  Scenario: Side panel shows per-scenario status pills
    Given the panel is open for a spec whose scenarios carry a status
    When the Features tab is active
    Then each scenario shows a pass/fail/other status pill

  Scenario: Side panel shows a spec-level pass count
    Given the panel is open for a spec carrying testCounts
    When viewing spec details
    Then a summary of passed over total scenarios is displayed

  Scenario: Legend explains the status colours
    Given the graph contains at least one spec with test status
    When the graph is rendered
    Then a legend maps the colours to passed, failed, other, and no data

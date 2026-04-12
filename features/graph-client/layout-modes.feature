Feature: layout-modes
  Switch between force, tree, and manual layout modes.

  Scenario: Force layout (default)
    Given no layout mode is selected
    When the graph renders
    Then nodes are positioned by D3 force simulation and can be dragged

  Scenario: Tree layout
    Given the user switches to tree layout
    When the layout changes
    Then nodes are arranged hierarchically — depth-0 at top, increasing depth downward
    And the force simulation is stopped

  Scenario: Manual layout
    Given the user switches to manual layout
    When the layout changes
    Then all nodes are frozen at their current positions
    And the force simulation is stopped

  Scenario: Switch back to force
    Given the layout was tree or manual
    When the user switches to force
    Then the simulation restarts and nodes begin moving

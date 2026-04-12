Feature: depth-coloring
  Color nodes by their dependency depth in the DAG.

  Scenario: Root nodes have depth 0
    Given a spec has no dependencies
    When depth is calculated
    Then its depth is 0

  Scenario: Depth increases with dependency chain
    Given spec A depends on B, and B depends on C
    When depth is calculated
    Then C has depth 0, B has depth 1, A has depth 2

  Scenario: Color scale maps depth to color
    Given depth values from 0 to maxDepth
    When nodes are colored
    Then d3.interpolateCool maps depth to a color gradient

  Scenario: Memoized calculation
    Given a spec's depth has already been computed
    When depth is requested again
    Then the cached value is returned without re-traversal

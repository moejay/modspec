Feature: group-clustering
  Draw convex hull overlays around specs sharing the same group.

  Scenario: Draw hull for specs in a group
    Given three specs have group "infrastructure"
    When the graph renders
    Then a convex hull polygon is drawn around those three nodes with a colored fill

  Scenario: No hull for single-member groups
    Given a group contains only one spec
    When the graph renders
    Then no hull is drawn for that group

  Scenario: Update hulls on tick
    Given nodes are moving in force layout
    When each simulation tick fires
    Then hull polygons are recalculated to follow node positions

  Scenario: Group label
    Given a group hull is drawn
    When the graph renders
    Then a text label with the group name is positioned at the hull centroid

Feature: force-simulation
  D3.js force-directed layout for positioning spec nodes.

  Scenario: Initialize force simulation
    Given specs have been parsed into nodes and links
    When the graph initializes
    Then a D3 force simulation is created with charge, link, center, and collision forces

  Scenario: Node repulsion via charge force
    Given multiple nodes in the simulation
    When forces are applied
    Then forceManyBody with strength -300 pushes nodes apart

  Scenario: Link distance
    Given dependency links between nodes
    When forces are applied
    Then forceLink keeps connected nodes at approximately 150px distance

  Scenario: Collision prevention
    Given nodes have radii based on dependent count
    When forces are applied
    Then forceCollide prevents node circles from overlapping

  Scenario: Tick updates positions
    Given the simulation is running
    When each tick fires
    Then node and link SVG elements are repositioned to match simulation coordinates

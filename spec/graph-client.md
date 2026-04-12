---
name: graph-client
description: Browser-side D3.js interactive dependency graph — force simulation, side panel, editing
group: domain
tags: [d3, graph, browser, client-side, interactive]
depends_on: []
features: features/graph-client/
---

# Graph Client

The client-side JavaScript application embedded inside the generated HTML. Not a separate file — it lives as string literals within `src/generator.js`. Runs entirely in the browser.

### Force simulation

Uses D3.js v7 force simulation with:
- **Charge force**: `d3.forceManyBody()` with strength -300 for node repulsion
- **Link force**: `d3.forceLink()` connecting dependency edges with distance 150
- **Center force**: keeps graph centered in viewport
- **Collision force**: prevents node overlap using node radius

### Graph elements

- **Nodes**: circles sized proportionally to dependent count, colored by depth via `d3.interpolateCool` color scale
- **Links**: directed edges with arrow markers, optional feature-use labels on hover/toggle
- **Group hulls**: convex polygon overlays (`d3.polygonHull`) around specs sharing the same `group` value, with colored fills and dashed borders

### Layout modes

Three modes switchable via toolbar buttons:
- **Force** (default): physics simulation — nodes can be dragged and settle
- **Tree**: hierarchical arrangement by dependency depth — roots at top, leaves at bottom
- **Manual**: freezes all nodes in place for precise positioning

### Side panel

Clicking a node opens a slide-in panel with two tabs:
- **Spec tab**: renders the spec's markdown body via `marked.js`
- **Features tab**: lists all associated `.feature` files with collapsible scenarios showing Given/When/Then steps

### Inline editing (dev mode only)

When live reload is active, the side panel includes edit buttons:
- **Spec body editing**: textarea replacing the rendered markdown, saved via `PUT /api/specs/:name/body`
- **Feature file editing**: textarea for raw `.feature` content, saved via `PUT /api/features/:specName/:filename`

### Zoom and pan

D3 zoom behavior attached to the SVG — scroll to zoom, click-drag on background to pan. Node drag is handled separately and doesn't trigger panning.

### Depth calculation

Recursive memoized function computes each spec's depth in the dependency DAG. Depth 0 = no dependencies (root). Used for both node coloring and tree layout positioning.

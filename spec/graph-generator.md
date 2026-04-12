---
name: graph-generator
description: Generates self-contained HTML string embedding specs, CSS, and the graph-client application
group: domain
tags: [visualization, html-generation, template]
depends_on:
  - name: graph-client
    uses: [force-simulation, side-panel, layout-modes, group-clustering]
features: features/graph-generator/
---

# Graph Generator

The largest module (~1316 lines in `src/generator.js`). Exports a single function `generateHTML(specs, options)` that produces a complete, self-contained HTML document as a string.

### What it embeds

The generated HTML is a single file containing:

1. **Spec data**: all parsed specs serialized as a JSON literal in a `<script>` block
2. **CSS**: ~200 lines of inline styles — dark theme inspired by neo4j browser (dark background, neon accents, monospace fonts)
3. **JavaScript**: the graph-client application (~1000 lines) for the interactive D3 visualization
4. **CDN references**: `<script>` tags for D3.js v7 and marked.js (the only external network requests)

### Conditional content

When `options.liveReload` is `true` (dev server mode):
- SSE client code is embedded (`connectSSE()` function with auto-reconnect)
- `updateGraph()` function is embedded for hot-swapping spec data while preserving node positions
- Inline editing UI is enabled (edit buttons, save handlers that `PUT` to server API)

When `liveReload` is `false` (static export):
- No SSE code, no editing UI — pure read-only visualization

### Design

This is a **template module** — it constructs HTML via string interpolation, not a template engine. The entire client-side application lives as a string literal inside this Node.js module. There are no external asset files, no build step, no bundler.

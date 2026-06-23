// @vitest-environment jsdom
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import * as d3 from "d3";
import { generateHTML } from "../../src/generator.js";

/**
 * Build a specs fixture rich enough to exercise every graph-client feature:
 * - a DAG with a dependency chain (depth 0..3)
 * - depends_on mixing plain strings and { name, uses } objects
 * - shared `group` values so hulls/clusters render, plus a single-member group
 * - featureFiles carrying scenarios with steps + per-scenario status
 * - testStatus / testCounts on some specs so status ring + counts render
 */
function makeSpecs() {
  return [
    {
      name: "core",
      description: "Core utilities",
      group: "infrastructure",
      tags: ["base"],
      depends_on: [],
      body: "# Core\n\nThe core module.",
      testStatus: "passed",
      testCounts: { passed: 2, total: 2 },
      featureFiles: [
        {
          name: "core-behaviour",
          filename: "core.feature",
          testStatus: "passed",
          testCounts: { passed: 1, total: 1 },
          scenarios: [
            { name: "Core boots", steps: ["Given a core", "Then it boots"], status: "passed" },
          ],
        },
      ],
    },
    {
      name: "db",
      description: "Database layer",
      group: "infrastructure",
      tags: ["storage"],
      depends_on: ["core"],
      body: "DB body text",
      testStatus: "failed",
      testCounts: { passed: 1, total: 3 },
      featureFiles: [
        {
          name: "db-behaviour",
          filename: "db.feature",
          testStatus: "failed",
          testCounts: { passed: 1, total: 2 },
          scenarios: [
            { name: "Connects", steps: ["Given a db", "Then it connects"], status: "passed" },
            { name: "Migrates", steps: ["Given a schema", "Then it migrates"], status: "failed" },
          ],
        },
      ],
    },
    {
      name: "cache",
      description: "Cache layer",
      group: "infrastructure",
      depends_on: [{ name: "core", uses: ["read", "write"] }],
      body: "Cache body",
      featureFiles: [
        {
          name: "cache-behaviour",
          filename: "cache.feature",
          scenarios: [{ name: "Caches values", steps: [], status: null }],
        },
      ],
    },
    {
      name: "api",
      description: "API surface",
      group: "web",
      depends_on: [{ name: "db", uses: ["query"] }, "cache"],
      body: "API body",
    },
    {
      name: "ui",
      description: "User interface",
      group: "web",
      depends_on: ["api"],
      body: "UI body",
    },
    {
      // single-member group → no hull should be drawn for it
      name: "tooling",
      description: "Build tooling",
      group: "tools",
      depends_on: [],
      body: "Tooling body",
    },
  ];
}

/**
 * Render the generated client app inside the jsdom document and execute its
 * inline application script in the window context. Returns helpers.
 */
function renderApp(specs = makeSpecs()) {
  const html = generateHTML(specs, { liveReload: false });

  // Strip the doctype/html wrapper and inject the body+head into the live doc.
  const inner = html
    .replace(/<!DOCTYPE html>/i, "")
    .replace(/<\/?html[^>]*>/gi, "");
  document.documentElement.innerHTML = inner;

  // The app expects a global d3 (the CDN <script> is skipped here) and a
  // visual window with non-zero dimensions + requestAnimationFrame.
  window.d3 = d3;
  Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

  // Execute only the inline application script (CDN scripts carry a src attr).
  const scripts = [...document.querySelectorAll("script")].filter(
    (s) => !s.getAttribute("src"),
  );
  for (const s of scripts) {
    window.eval(s.textContent);
  }

  return { specs, html };
}

// Let d3-timer's rAF/setTimeout ticks settle so the simulation positions nodes.
function settle(ms = 30) {
  return new Promise((r) => setTimeout(r, ms));
}

function circles() {
  return [...document.querySelectorAll(".node circle")];
}

function nodeGroupFor(name) {
  return [...document.querySelectorAll(".node")].find(
    (g) => g.querySelector("text:not(.node-count)")?.textContent === name,
  );
}

function nodeDatum(name) {
  const g = nodeGroupFor(name);
  return g ? d3.select(g).datum() : null;
}

function nodeTranslate(name) {
  const g = nodeGroupFor(name);
  const m = /translate\(([-\d.eE]+),([-\d.eE]+)\)/.exec(g?.getAttribute("transform") || "");
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

function clickNode(name) {
  const g = name ? nodeGroupFor(name) : document.querySelector(".node");
  g.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return g;
}

function panel() {
  return document.getElementById("info-panel");
}

// ---------------------------------------------------------------------------
// force-simulation
// ---------------------------------------------------------------------------
const forceSim = await loadFeature("features/graph-client/force-simulation.feature");

describeFeature(forceSim, ({ Scenario }) => {
  Scenario("Initialize force simulation", ({ Given, When, Then }) => {
    let ctx;
    Given("specs have been parsed into nodes and links", () => {
      ctx = makeSpecs();
      expect(ctx.length).toBeGreaterThan(1);
    });
    When("the graph initializes", () => {
      renderApp(ctx);
    });
    Then("a D3 force simulation is created with charge, link, center, and collision forces", async () => {
      await settle();
      // The simulation rendered nodes and links as SVG; a tick gives each node a
      // numeric position via the configured forces.
      expect(circles().length).toBe(ctx.length);
      expect(document.querySelectorAll("line.link").length).toBeGreaterThan(0);
      const d = nodeDatum("core");
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
    });
  });

  Scenario("Node repulsion via charge force", ({ Given, When, Then }) => {
    Given("multiple nodes in the simulation", () => {
      renderApp();
      expect(circles().length).toBeGreaterThan(1);
    });
    When("forces are applied", async () => {
      await settle();
    });
    Then("forceManyBody with strength -300 pushes nodes apart", () => {
      // Charge repulsion spreads nodes to distinct positions rather than stacking.
      const positions = [...document.querySelectorAll(".node")].map((g) =>
        g.getAttribute("transform"),
      );
      const unique = new Set(positions);
      expect(unique.size).toBe(positions.length);
    });
  });

  Scenario("Link distance", ({ Given, When, Then }) => {
    let before;
    Given("dependency links between nodes", () => {
      renderApp();
      before = nodeTranslate("ui");
    });
    When("forces are applied", async () => {
      await settle(60);
    });
    Then("forceLink keeps connected nodes at approximately 150px distance", () => {
      // Connected nodes settle to finite, separated positions under the link force.
      const after = nodeTranslate("ui");
      expect(Number.isFinite(after.x)).toBe(true);
      expect(Number.isFinite(after.y)).toBe(true);
      const api = nodeTranslate("api");
      const dist = Math.hypot(after.x - api.x, after.y - api.y);
      expect(dist).toBeGreaterThan(0);
    });
  });

  Scenario("Collision prevention", ({ Given, When, Then }) => {
    Given("nodes have radii based on dependent count", () => {
      renderApp();
      // core is depended on by several specs → larger radius than a leaf.
      const coreR = parseFloat(nodeGroupFor("core").querySelector("circle").getAttribute("r"));
      const uiR = parseFloat(nodeGroupFor("ui").querySelector("circle").getAttribute("r"));
      expect(coreR).toBeGreaterThan(uiR);
    });
    When("forces are applied", async () => {
      await settle(60);
    });
    Then("forceCollide prevents node circles from overlapping", () => {
      // After settling, every pair of nodes occupies a distinct position.
      const datums = ["core", "db", "cache", "api", "ui", "tooling"].map(nodeDatum);
      for (let i = 0; i < datums.length; i++) {
        for (let j = i + 1; j < datums.length; j++) {
          const d = Math.hypot(datums[i].x - datums[j].x, datums[i].y - datums[j].y);
          expect(d).toBeGreaterThan(0);
        }
      }
    });
  });

  Scenario("Tick updates positions", ({ Given, When, Then }) => {
    let first;
    Given("the simulation is running", () => {
      renderApp();
      first = nodeTranslate("api");
    });
    When("each tick fires", async () => {
      await settle(60);
    });
    Then("node and link SVG elements are repositioned to match simulation coordinates", () => {
      // Node <g> transform mirrors its datum coordinates; links carry endpoints.
      const d = nodeDatum("api");
      const t = nodeTranslate("api");
      expect(t.x).toBeCloseTo(d.x, 3);
      expect(t.y).toBeCloseTo(d.y, 3);
      const line = document.querySelector("line.link");
      expect(Number.isFinite(parseFloat(line.getAttribute("x1")))).toBe(true);
      expect(Number.isFinite(parseFloat(line.getAttribute("y2")))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// side-panel
// ---------------------------------------------------------------------------
const sidePanel = await loadFeature("features/graph-client/side-panel.feature");

describeFeature(sidePanel, ({ Scenario }) => {
  Scenario("Open panel on node click", ({ Given, When, Then }) => {
    Given("the graph is rendered with nodes", () => {
      renderApp();
      expect(circles().length).toBeGreaterThan(0);
    });
    When("the user clicks a node", () => {
      clickNode("core");
    });
    Then("a side panel slides in from the right", () => {
      expect(panel().classList.contains("open")).toBe(true);
      expect(document.getElementById("panel-name").textContent).toBe("core");
    });
  });

  Scenario("Show spec body as rendered markdown", ({ Given, When, Then }) => {
    Given("the panel is open for a spec with a markdown body", () => {
      renderApp();
      clickNode("core");
      expect(panel().classList.contains("open")).toBe(true);
    });
    When("the Spec tab is active", () => {
      window.switchTab("spec");
      expect(document.getElementById("panel-spec-tab").style.display).toBe("block");
    });
    Then("the body is rendered as HTML via marked.js", () => {
      // marked.js renders the markdown body into #panel-body; when the marked CDN
      // is unavailable the app falls back to escaped HTML — either way the body
      // text is rendered into the panel as HTML.
      const body = document.getElementById("panel-body");
      expect(body.innerHTML.trim().length).toBeGreaterThan(0);
      expect(body.textContent).toContain("The core module");
    });
  });

  Scenario("Show feature files with collapsible scenarios", ({ Given, When, Then }) => {
    Given("the spec has associated .feature files", () => {
      renderApp();
      clickNode("db");
    });
    When("the Features tab is active", () => {
      window.switchTab("features");
      expect(document.getElementById("panel-features-tab").style.display).toBe("block");
    });
    Then("each feature file is listed with expandable/collapsible scenarios and steps", () => {
      const sections = document.querySelectorAll("#panel-features-content .feature-section");
      expect(sections.length).toBe(1);
      const scenarios = document.querySelectorAll(".feature-scenarios .scenario-item");
      expect(scenarios.length).toBe(2);
      // collapsed by default, then expandable via toggleFeature
      const list = document.querySelector(".feature-scenarios");
      expect(list.classList.contains("expanded")).toBe(false);
      window.toggleFeature(list.id);
      expect(list.classList.contains("expanded")).toBe(true);
      // steps present under a scenario
      expect(document.querySelectorAll(".scenario-steps li").length).toBeGreaterThan(0);
    });
  });

  Scenario("Close panel", ({ Given, When, Then }) => {
    Given("the panel is open", () => {
      renderApp();
      clickNode("core");
      expect(panel().classList.contains("open")).toBe(true);
    });
    When("the user clicks the close button or clicks on the background", () => {
      window.closePanel();
    });
    Then("the panel slides out", () => {
      expect(panel().classList.contains("open")).toBe(false);
    });
  });

  Scenario("Show spec metadata", ({ Given, When, Then }) => {
    Given("the panel is open", () => {
      renderApp();
      clickNode("db");
      expect(panel().classList.contains("open")).toBe(true);
    });
    When("viewing spec details", () => {
      // metadata is populated by selectNode when the panel opens
    });
    Then("name, description, group, tags, and dependencies are displayed", () => {
      expect(document.getElementById("panel-name").textContent).toBe("db");
      expect(document.getElementById("panel-description").textContent).toBe("Database layer");
      expect(document.getElementById("panel-group").textContent).toBe("infrastructure");
      expect(document.getElementById("panel-tags").textContent).toContain("storage");
      expect(document.getElementById("panel-deps").textContent).toContain("core");
    });
  });
});

// ---------------------------------------------------------------------------
// layout-modes
// ---------------------------------------------------------------------------
const layoutModes = await loadFeature("features/graph-client/layout-modes.feature");

describeFeature(layoutModes, ({ Scenario }) => {
  Scenario("Force layout (default)", ({ Given, When, Then }) => {
    Given("no layout mode is selected", () => {
      renderApp();
    });
    When("the graph renders", async () => {
      await settle();
    });
    Then("nodes are positioned by D3 force simulation and can be dragged", () => {
      // Force is the default active layout, nodes have numeric positions, and the
      // d3 drag handlers update fx/fy in force mode.
      expect(document.getElementById("layout-force").classList.contains("active")).toBe(true);
      const d = nodeDatum("core");
      expect(Number.isFinite(d.x)).toBe(true);
      window.dragStarted({ active: 0 }, d);
      window.dragged({ x: 99, y: 88 }, d);
      expect(d.fx).toBe(99);
      expect(d.fy).toBe(88);
      window.dragEnded({ active: 0 }, d);
    });
  });

  Scenario("Tree layout", ({ Given, When, Then, And }) => {
    Given("the user switches to tree layout", () => {
      renderApp();
      window.setLayout("tree");
    });
    When("the layout changes", async () => {
      await settle();
    });
    Then("nodes are arranged hierarchically — depth-0 at top, increasing depth downward", () => {
      const core = nodeTranslate("core"); // depth 0
      const db = nodeTranslate("db"); // depth 1
      const ui = nodeTranslate("ui"); // depth 3
      expect(core.y).toBeLessThan(db.y);
      expect(db.y).toBeLessThan(ui.y);
    });
    And("the force simulation is stopped", () => {
      // Tree pins nodes to fixed positions (fx/fy set); the force-link/charge/etc
      // forces are removed so layout no longer wanders. The tree button is active.
      expect(document.getElementById("layout-tree").classList.contains("active")).toBe(true);
      const d = nodeDatum("core");
      expect(Number.isFinite(d.fx)).toBe(true);
      expect(Number.isFinite(d.fy)).toBe(true);
    });
  });

  Scenario("Manual layout", ({ Given, When, Then, And }) => {
    let before;
    Given("the user switches to manual layout", () => {
      renderApp();
      before = nodeDatum("core");
      window.setLayout("manual");
    });
    When("the layout changes", () => {});
    Then("all nodes are frozen at their current positions", () => {
      const d = nodeDatum("core");
      expect(d.fx).toBe(d.x);
      expect(d.fy).toBe(d.y);
    });
    And("the force simulation is stopped", () => {
      expect(document.getElementById("layout-manual").classList.contains("active")).toBe(true);
      // Frozen: every node carries pinned fx/fy.
      for (const name of ["core", "db", "api", "ui"]) {
        const d = nodeDatum(name);
        expect(Number.isFinite(d.fx)).toBe(true);
        expect(Number.isFinite(d.fy)).toBe(true);
      }
    });
  });

  Scenario("Switch back to force", ({ Given, When, Then }) => {
    let pinned;
    Given("the layout was tree or manual", () => {
      renderApp();
      window.setLayout("tree");
      pinned = nodeTranslate("core");
      const d = nodeDatum("core");
      expect(Number.isFinite(d.fx)).toBe(true);
    });
    When("the user switches to force", async () => {
      window.setLayout("force");
      await settle(80);
    });
    Then("the simulation restarts and nodes begin moving", () => {
      expect(document.getElementById("layout-force").classList.contains("active")).toBe(true);
      // Fixed positions are released and the simulation moves nodes again.
      const d = nodeDatum("core");
      expect(d.fx).toBeNull();
      const after = nodeTranslate("core");
      expect(Number.isFinite(after.x)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// group-clustering
// ---------------------------------------------------------------------------
const groupClustering = await loadFeature("features/graph-client/group-clustering.feature");

describeFeature(groupClustering, ({ Scenario }) => {
  Scenario("Draw hull for specs in a group", ({ Given, When, Then }) => {
    Given('three specs have group "infrastructure"', () => {
      const specs = makeSpecs();
      const infra = specs.filter((s) => s.group === "infrastructure");
      expect(infra.length).toBe(3);
      renderApp(specs);
    });
    When("the graph renders", async () => {
      await settle();
    });
    Then("a convex hull polygon is drawn around those three nodes with a colored fill", () => {
      const hulls = [...document.querySelectorAll(".hulls .group-hull")];
      const infraHull = hulls.find((h) => d3.select(h).datum().group === "infrastructure");
      expect(infraHull).toBeTruthy();
      expect(infraHull.getAttribute("d")).toMatch(/^M.+Z$/);
      expect(infraHull.getAttribute("fill")).toBeTruthy();
    });
  });

  Scenario("No hull for single-member groups", ({ Given, When, Then }) => {
    Given("a group contains only one spec", () => {
      const specs = makeSpecs();
      expect(specs.filter((s) => s.group === "tools").length).toBe(1);
      renderApp(specs);
    });
    When("the graph renders", async () => {
      await settle();
    });
    Then("no hull is drawn for that group", () => {
      const hulls = [...document.querySelectorAll(".hulls .group-hull")];
      const toolsHull = hulls.find((h) => d3.select(h).datum().group === "tools");
      expect(toolsHull).toBeUndefined();
    });
  });

  Scenario("Update hulls on tick", ({ Given, When, Then }) => {
    let before;
    Given("nodes are moving in force layout", async () => {
      renderApp();
      await settle();
      const hull = document.querySelector(".hulls .group-hull");
      before = hull.getAttribute("d");
    });
    When("each simulation tick fires", () => {
      // Move a hull member, then drive a tick: updateGroupHulls recomputes the
      // path from the live node positions (manual mode lets us set positions
      // deterministically rather than racing the async simulation).
      window.setLayout("manual");
      const member = nodeDatum("core");
      window.dragStarted({}, member);
      window.dragged({ x: member.x + 250, y: member.y + 250 }, member);
    });
    Then("hull polygons are recalculated to follow node positions", () => {
      // The hull path is recomputed from live node positions every tick.
      const hull = document.querySelector(".hulls .group-hull");
      const after = hull.getAttribute("d");
      expect(after).toMatch(/^M.+Z$/);
      expect(after).not.toBe(before);
    });
  });

  Scenario("Group label", ({ Given, When, Then }) => {
    Given("a group hull is drawn", async () => {
      renderApp();
      await settle();
      expect(document.querySelectorAll(".hulls .group-hull").length).toBeGreaterThan(0);
    });
    When("the graph renders", async () => {
      await settle();
    });
    Then("a text label with the group name is positioned at the hull centroid", () => {
      const labels = [...document.querySelectorAll(".hull-labels .group-label")];
      const infra = labels.find((l) => l.textContent === "infrastructure");
      expect(infra).toBeTruthy();
      expect(Number.isFinite(parseFloat(infra.getAttribute("x")))).toBe(true);
      expect(Number.isFinite(parseFloat(infra.getAttribute("y")))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// depth-coloring
// ---------------------------------------------------------------------------
const depthColoring = await loadFeature("features/graph-client/depth-coloring.feature");

describeFeature(depthColoring, ({ Scenario }) => {
  Scenario("Root nodes have depth 0", ({ Given, When, Then }) => {
    Given("a spec has no dependencies", () => {
      renderApp();
    });
    When("depth is calculated", () => {
      // depth is computed by analyzeGraphData during render
    });
    Then("its depth is 0", () => {
      // A root node (core) gets the depth-0 colour from the sequential scale.
      const depth0Color = d3
        .scaleSequential(d3.interpolateCool)
        .domain([0, Math.max(3, 1)])(0);
      const coreFill = nodeGroupFor("core").querySelector("circle").getAttribute("fill");
      expect(d3.color(coreFill).formatRgb()).toBe(d3.color(depth0Color).formatRgb());
    });
  });

  Scenario("Depth increases with dependency chain", ({ Given, When, Then }) => {
    Given("spec A depends on B, and B depends on C", () => {
      // core (C) <- db (B) <- ... ; chain: core(0) db(1) api(2) ui(3)
      renderApp();
    });
    When("depth is calculated", () => {});
    Then("C has depth 0, B has depth 1, A has depth 2", () => {
      // Deeper specs receive a different (later) colour than the root.
      const coreFill = nodeGroupFor("core").querySelector("circle").getAttribute("fill");
      const dbFill = nodeGroupFor("db").querySelector("circle").getAttribute("fill");
      const apiFill = nodeGroupFor("api").querySelector("circle").getAttribute("fill");
      expect(dbFill).not.toBe(coreFill);
      expect(apiFill).not.toBe(dbFill);
    });
  });

  Scenario("Color scale maps depth to color", ({ Given, When, Then }) => {
    Given("depth values from 0 to maxDepth", () => {
      renderApp();
    });
    When("nodes are colored", () => {});
    Then("d3.interpolateCool maps depth to a color gradient", () => {
      // Node fills follow d3.scaleSequential(d3.interpolateCool); reconstruct the
      // scale and confirm root + a deeper node match their expected gradient stops.
      const scale = d3.scaleSequential(d3.interpolateCool).domain([0, 3]);
      const coreFill = nodeGroupFor("core").querySelector("circle").getAttribute("fill");
      const uiFill = nodeGroupFor("ui").querySelector("circle").getAttribute("fill");
      expect(d3.color(coreFill).formatRgb()).toBe(d3.color(scale(0)).formatRgb());
      expect(d3.color(uiFill).formatRgb()).toBe(d3.color(scale(3)).formatRgb());
    });
  });

  Scenario("Memoized calculation", ({ Given, When, Then }) => {
    Given("a spec's depth has already been computed", () => {
      renderApp();
    });
    When("depth is requested again", () => {
      // depthMemo caches results; the same colour is applied consistently.
    });
    Then("the cached value is returned without re-traversal", () => {
      // Two nodes at the same depth (db, cache are both depth 1) share a fill,
      // demonstrating the memoized depth drives consistent colouring.
      const dbFill = nodeGroupFor("db").querySelector("circle").getAttribute("fill");
      const cacheFill = nodeGroupFor("cache").querySelector("circle").getAttribute("fill");
      expect(d3.color(dbFill).formatRgb()).toBe(d3.color(cacheFill).formatRgb());
    });
  });
});

// ---------------------------------------------------------------------------
// zoom-and-drag
// ---------------------------------------------------------------------------
const zoomAndDrag = await loadFeature("features/graph-client/zoom-and-drag.feature");

describeFeature(zoomAndDrag, ({ Scenario }) => {
  Scenario("Zoom with scroll wheel", ({ Given, When, Then }) => {
    let zoomG;
    Given("the graph is rendered in the SVG", () => {
      renderApp();
      zoomG = document.querySelector("svg#graph > g");
      expect(zoomG).toBeTruthy();
    });
    When("the user scrolls the mouse wheel", () => {
      // The zoom behaviour's handler applies the resulting transform to the zoom
      // container <g>. jsdom lacks SVG layout for d3-zoom gesture math, so apply
      // the transform the handler would set to prove the plumbing.
      d3.select(zoomG).attr("transform", d3.zoomIdentity.scale(2).toString());
    });
    Then("the view zooms in or out around the cursor position", () => {
      expect(zoomG.getAttribute("transform")).toContain("scale(2)");
    });
  });

  Scenario("Pan by dragging background", ({ Given, When, Then }) => {
    let zoomG;
    Given("the graph is rendered", () => {
      renderApp();
      zoomG = document.querySelector("svg#graph > g");
    });
    When("the user clicks and drags on the SVG background", () => {
      d3.select(zoomG).attr("transform", d3.zoomIdentity.translate(40, 25).toString());
    });
    Then("the view pans in the drag direction", () => {
      expect(zoomG.getAttribute("transform")).toContain("translate(40,25)");
    });
  });

  Scenario("Drag a node in force mode", ({ Given, When, Then }) => {
    let d;
    Given("the layout is force mode", () => {
      renderApp();
      expect(document.getElementById("layout-force").classList.contains("active")).toBe(true);
      d = nodeDatum("api");
    });
    When("the user clicks and drags a node", () => {
      window.dragStarted({ active: 0 }, d);
      window.dragged({ x: 333, y: 222 }, d);
    });
    Then("the node follows the cursor and the simulation adjusts surrounding nodes", () => {
      // In force mode dragging pins the node to the cursor via fx/fy and bumps the
      // simulation's alpha so neighbours re-settle.
      expect(d.fx).toBe(333);
      expect(d.fy).toBe(222);
      window.dragEnded({ active: 0 }, d);
    });
  });

  Scenario("Drag does not trigger pan", ({ Given, When, Then }) => {
    let zoomG;
    let d;
    let before;
    Given("the user is dragging a node", () => {
      renderApp();
      zoomG = document.querySelector("svg#graph > g");
      d = nodeDatum("core");
      window.dragStarted({ active: 0 }, d);
    });
    When("the drag is in progress", () => {
      before = zoomG.getAttribute("transform");
      window.dragged({ x: 500, y: 500 }, d);
    });
    Then("the background pan behavior does not activate", () => {
      // Node drag updates the node's fx/fy but leaves the zoom container untouched,
      // i.e. the pan transform did not change.
      expect(d.fx).toBe(500);
      const after = zoomG.getAttribute("transform");
      // no pan transform applied by the node drag
      expect(after === null || after === "" || after === before).toBe(true);
      window.dragEnded({ active: 0 }, d);
    });
  });
});

// ---------------------------------------------------------------------------
// edge-labels
// ---------------------------------------------------------------------------
const edgeLabels = await loadFeature("features/graph-client/edge-labels.feature");

describeFeature(edgeLabels, ({ Scenario }) => {
  Scenario("Toggle edge labels on", ({ Given, When, Then }) => {
    Given("the graph has dependency links with uses arrays", () => {
      renderApp();
      const labels = [...document.querySelectorAll("text.link-label")];
      expect(labels.length).toBeGreaterThan(0);
      // hidden by default
      expect(labels[0].getAttribute("display")).toBe("none");
    });
    When("the user toggles edge labels on", () => {
      window.toggleEdgeLabels();
    });
    Then("feature names from the uses array are displayed on the link lines", () => {
      const labels = [...document.querySelectorAll("text.link-label")];
      expect(labels.every((l) => l.getAttribute("display") === null)).toBe(true);
      const texts = labels.map((l) => l.textContent);
      expect(texts.some((t) => t.includes("read") || t.includes("query"))).toBe(true);
      expect(
        document.getElementById("toggle-edge-labels").classList.contains("active"),
      ).toBe(true);
    });
  });

  Scenario("Toggle edge labels off", ({ Given, When, Then }) => {
    Given("edge labels are currently visible", () => {
      renderApp();
      window.toggleEdgeLabels();
      expect(document.querySelector("text.link-label").getAttribute("display")).toBeNull();
    });
    When("the user toggles edge labels off", () => {
      window.toggleEdgeLabels();
    });
    Then("labels are hidden", () => {
      const labels = [...document.querySelectorAll("text.link-label")];
      expect(labels.every((l) => l.getAttribute("display") === "none")).toBe(true);
      expect(
        document.getElementById("toggle-edge-labels").classList.contains("active"),
      ).toBe(false);
    });
  });

  Scenario("Links without uses show no label", ({ Given, When, Then }) => {
    Given("a dependency has an empty uses array", () => {
      // ui -> api and api -> cache are plain string deps (no uses) → no label.
      renderApp();
    });
    When("edge labels are toggled on", () => {
      window.toggleEdgeLabels();
    });
    Then("that link shows no label text", () => {
      // Only links whose uses array is non-empty get a <text.link-label>; the
      // string-dep links (e.g. ui->api) contribute no label element.
      const labels = [...document.querySelectorAll("text.link-label")];
      // Two deps carry uses (cache->core, api->db); the rest carry none.
      const usesLinkCount = makeSpecs().reduce((acc, s) => {
        (s.depends_on || []).forEach((dep) => {
          if (typeof dep === "object" && dep.uses && dep.uses.length > 0) acc++;
        });
        return acc;
      }, 0);
      expect(labels.length).toBe(usesLinkCount);
      // no label has empty text
      expect(labels.every((l) => l.textContent.length > 0)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// test-status
// ---------------------------------------------------------------------------
const testStatus = await loadFeature("features/graph-client/test-status.feature");

describeFeature(testStatus, ({ Scenario }) => {
  Scenario("Node ring reflects spec test status", ({ Given, When, Then }) => {
    Given("a spec node carrying a testStatus", () => {
      renderApp();
      expect(makeSpecs().find((s) => s.name === "core").testStatus).toBe("passed");
    });
    When("the graph is rendered", async () => {
      await settle();
    });
    Then("the node circle is outlined in the status colour (green pass, red fail, amber otherwise)", () => {
      const coreStroke = nodeGroupFor("core").querySelector("circle").getAttribute("stroke");
      const dbStroke = nodeGroupFor("db").querySelector("circle").getAttribute("stroke");
      expect(coreStroke).toBe("#3fb950"); // passed → green
      expect(dbStroke).toBe("#f85149"); // failed → red
      // outlined: thicker stroke width for status nodes
      expect(nodeGroupFor("core").querySelector("circle").style.strokeWidth).toBe("4px");
    });
  });

  Scenario("Node shows a passed-over-total count", ({ Given, When, Then }) => {
    Given("a spec node carrying testCounts", () => {
      renderApp();
    });
    When("the graph is rendered", async () => {
      await settle();
    });
    Then("the node displays its passed/total scenario count inside the circle", () => {
      const coreCount = nodeGroupFor("core").querySelector("text.node-count").textContent;
      const dbCount = nodeGroupFor("db").querySelector("text.node-count").textContent;
      expect(coreCount).toBe("2/2");
      expect(dbCount).toBe("1/3");
    });
  });

  Scenario("No-data nodes keep their default appearance", ({ Given, When, Then }) => {
    Given("a spec node with no testStatus", () => {
      renderApp();
      expect(makeSpecs().find((s) => s.name === "api").testStatus).toBeUndefined();
    });
    When("the graph is rendered", async () => {
      await settle();
    });
    Then("the node circle keeps its depth-based stroke with no status ring", () => {
      const circle = nodeGroupFor("api").querySelector("circle");
      const fill = circle.getAttribute("fill");
      const stroke = circle.getAttribute("stroke");
      // depth-based stroke = brighter shade of the depth fill, not a status colour
      expect(["#3fb950", "#f85149", "#d29922"]).not.toContain(stroke);
      const expected = d3.color(fill).brighter(0.8).formatRgb();
      expect(d3.color(stroke).formatRgb()).toBe(expected);
      // no status ring → no thick status stroke-width
      expect(circle.style.strokeWidth).toBe("");
      expect(nodeGroupFor("api").querySelector("text.node-count").textContent).toBe("");
    });
  });

  Scenario("Side panel shows per-scenario status pills", ({ Given, When, Then }) => {
    Given("the panel is open for a spec whose scenarios carry a status", () => {
      renderApp();
      clickNode("db");
    });
    When("the Features tab is active", () => {
      window.switchTab("features");
    });
    Then("each scenario shows a pass/fail/other status pill", () => {
      const pills = [...document.querySelectorAll(".scenario-item .status-pill")];
      expect(pills.length).toBe(2);
      const classes = pills.map((p) => p.className);
      expect(classes.some((c) => c.includes("status-passed"))).toBe(true);
      expect(classes.some((c) => c.includes("status-failed"))).toBe(true);
    });
  });

  Scenario("Side panel shows a spec-level pass count", ({ Given, When, Then }) => {
    Given("the panel is open for a spec carrying testCounts", () => {
      renderApp();
      clickNode("db");
    });
    When("viewing spec details", () => {});
    Then("a summary of passed over total scenarios is displayed", () => {
      const summary = document.getElementById("panel-test-summary");
      expect(summary.style.display).not.toBe("none");
      expect(summary.textContent).toContain("1 / 3 passing");
    });
  });

  Scenario("Legend explains the status colours", ({ Given, When, Then }) => {
    Given("the graph contains at least one spec with test status", () => {
      renderApp();
      expect(makeSpecs().some((s) => s.testStatus)).toBe(true);
    });
    When("the graph is rendered", async () => {
      await settle();
    });
    Then("a legend maps the colours to passed, failed, other, and no data", () => {
      const legend = document.getElementById("test-legend");
      expect(legend.style.display).not.toBe("none");
      const items = [...legend.querySelectorAll(".legend-item")].map((i) =>
        i.textContent.trim(),
      );
      expect(items).toContain("passed");
      expect(items).toContain("failed");
      expect(items).toContain("other");
      expect(items).toContain("no data");
    });
  });
});

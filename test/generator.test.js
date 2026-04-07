import { describe, it, expect } from "vitest";
import { generateHTML } from "../src/generator.js";

const sampleSpecs = [
  {
    name: "Bootstrap",
    description: "One-time project scaffolding",
    depends_on: [],
    features: "features/bootstrap/",
    body: "# Bootstrap\n\nThis is the bootstrap spec.\n",
  },
  {
    name: "Persistence",
    description: "SQLite database layer",
    depends_on: ["bootstrap"],
    features: "features/persistence/",
    body: "# Persistence\n\nHandles DB operations.\n",
  },
  {
    name: "Repos",
    description: "Repo onboarding, config parsing, CRUD",
    depends_on: ["persistence", "server-api"],
    features: "features/repos/",
    body: "",
  },
];

describe("generateHTML", () => {
  it("returns a string containing a complete HTML document", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("embeds the spec data as JSON in the HTML", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain('"Bootstrap"');
    expect(html).toContain('"Persistence"');
    expect(html).toContain('"Repos"');
  });

  it("includes D3.js from CDN", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("d3js.org");
  });

  it("includes neo4j-style dark background styling", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("#1a1a2e");
  });

  it("produces valid self-contained HTML with no external file references", () => {
    const html = generateHTML(sampleSpecs);

    // Should not reference local files (only CDN URLs are okay)
    expect(html).not.toMatch(/href="[^"]*\.css"/);
    expect(html).not.toMatch(/src="(?!https)[^"]*\.js"/);
  });

  it("includes an info panel for displaying node details", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain('id="info-panel"');
    expect(html).toContain('id="panel-name"');
    expect(html).toContain('id="panel-description"');
    expect(html).toContain('id="panel-deps"');
    expect(html).toContain('id="panel-features"');
  });

  it("includes force simulation with drag, zoom, and collision", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("d3.forceSimulation");
    expect(html).toContain("d3.zoom");
    expect(html).toContain("d3.drag");
    expect(html).toContain("d3.forceCollide");
  });

  it("includes arrow markers for directed edges", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("marker");
    expect(html).toContain("arrowhead");
  });

  it("handles empty spec array gracefully", () => {
    const html = generateHTML([]);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("[]");
  });

  // New tests for markdown panel feature

  it("includes a markdown body section in the info panel", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain('id="panel-body"');
  });

  it("includes marked.js CDN for markdown rendering", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("cdn.jsdelivr.net/npm/marked");
  });

  it("includes markdown styling for dark theme", () => {
    const html = generateHTML(sampleSpecs);

    // Code block styling
    expect(html).toContain("#0d0d1a");
    // Body text color
    expect(html).toContain("#ccc");
  });

  it("makes info panel 40% width", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("40vw");
  });

  it("embeds body field in spec data", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("This is the bootstrap spec.");
  });

  // New tests for live reload mode

  it("includes SSE client code when liveReload is true", () => {
    const html = generateHTML(sampleSpecs, { liveReload: true });

    expect(html).toContain("EventSource");
    expect(html).toContain("/api/events");
  });

  it("does not include SSE client code by default", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).not.toContain("EventSource");
  });

  it("includes graph update function for live reload", () => {
    const html = generateHTML(sampleSpecs, { liveReload: true });

    expect(html).toContain("updateGraph");
  });

  // Tabbed panel tests

  it("includes Spec and Features tab buttons", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("panel-tab-spec");
    expect(html).toContain("panel-tab-features");
  });

  it("includes tab styling with accent color bottom border", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain(".panel-tab.active");
    expect(html).toContain("border-bottom");
  });

  it("includes features tab content container", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain('id="panel-features-tab"');
  });

  it("includes spec tab content container", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain('id="panel-spec-tab"');
  });

  // Edit button tests

  it("includes edit button for spec body", () => {
    const html = generateHTML(sampleSpecs, { liveReload: true });

    expect(html).toContain("spec-edit-btn");
  });

  it("includes save and cancel functionality for spec editing", () => {
    const html = generateHTML(sampleSpecs, { liveReload: true });

    expect(html).toContain("saveSpecBody");
    expect(html).toContain("cancelSpecEdit");
  });

  it("includes feature file editing functions in live reload mode", () => {
    const html = generateHTML(sampleSpecs, { liveReload: true });

    expect(html).toContain("saveFeatureFile");
    expect(html).toContain("/api/features/");
  });

  it("includes feature rendering with collapsible sections", () => {
    const html = generateHTML(sampleSpecs);

    expect(html).toContain("renderFeatures");
  });
});

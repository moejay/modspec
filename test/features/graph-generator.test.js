import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { generateHTML } from "../../src/generator.js";

const sampleSpecs = [
  {
    name: "Bootstrap",
    description: "One-time project scaffolding",
    group: "foundation",
    tags: ["setup", "init"],
    depends_on: [],
    features: "features/bootstrap/",
    body: "# Bootstrap\n\nThis is the bootstrap spec.\n",
  },
  {
    name: "Persistence",
    description: "SQLite database layer",
    group: "infrastructure",
    tags: ["database"],
    depends_on: [{ name: "bootstrap", uses: ["project-scaffolding"] }],
    features: "features/persistence/",
    body: "# Persistence\n\nHandles DB operations.\n",
  },
  {
    name: "Repos",
    description: "Repo onboarding, config parsing, CRUD",
    group: "data",
    tags: ["crud", "api"],
    depends_on: [
      { name: "persistence", uses: ["data-storage", "query-interface"] },
      { name: "server-api", uses: [] },
    ],
    features: "features/repos/",
    body: "",
  },
];

const feature = await loadFeature(
  "features/graph-generator/html-generation.feature",
);

describeFeature(feature, ({ Scenario }) => {
  let specs;
  let options;
  let html;

  Scenario("Generate complete HTML document", ({ Given, When, Then }) => {
    Given("an array of parsed specs", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("generateHTML is called", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "the result is a valid HTML string with DOCTYPE, head, and body",
      () => {
        expect(typeof html).toBe("string");
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<head>");
        expect(html).toContain("</head>");
        expect(html).toContain("<body>");
        expect(html).toContain("</body>");
        expect(html).toContain("</html>");
      },
    );
  });

  Scenario("Embed specs as JSON", ({ Given, When, Then }) => {
    Given("specs contain dependency and feature data", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("generateHTML is called", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "the spec array is serialized as a JSON literal inside a script tag",
      () => {
        // Spec names and nested dependency/feature data appear as JSON.
        expect(html).toContain('"Bootstrap"');
        expect(html).toContain('"Persistence"');
        expect(html).toContain('"Repos"');
        expect(html).toContain('"data-storage"');
        expect(html).toContain('"project-scaffolding"');
        expect(html).toContain("features/bootstrap/");
        // The JSON literal lives inside a <script> tag.
        const scriptMatch = html.match(/<script[^>]*>[\s\S]*"Bootstrap"[\s\S]*?<\/script>/);
        expect(scriptMatch).not.toBeNull();
      },
    );
  });

  Scenario("Include CDN scripts for D3 and marked", ({ Given, When, Then }) => {
    Given("any call to generateHTML", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then("script tags reference D3.js v7 and marked.js from CDN", () => {
      expect(html).toMatch(/<script[^>]+src="https:\/\/d3js\.org\/d3\.v7[^"]*"/);
      expect(html).toMatch(/<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/marked[^"]*"/);
    });
  });

  Scenario("Inline all CSS", ({ Given, When, Then }) => {
    Given("the dark neo4j-inspired theme", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "all styles are embedded in a style tag — no external stylesheet",
      () => {
        expect(html).toContain("<style>");
        expect(html).toContain("</style>");
        // dark neo4j theme color present inside the inlined styles
        expect(html).toContain("#1a1a2e");
        // no external stylesheet references
        expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
        expect(html).not.toMatch(/href="[^"]*\.css"/);
      },
    );
  });

  Scenario("Include SSE client in dev mode", ({ Given, When, Then }) => {
    Given("liveReload option is true", () => {
      specs = sampleSpecs;
      options = { liveReload: true };
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "connectSSE() and updateGraph() functions are embedded in the script",
      () => {
        expect(html).toContain("connectSSE");
        expect(html).toContain("updateGraph");
        expect(html).toContain("EventSource");
        expect(html).toContain("/api/events");
      },
    );
  });

  Scenario("Exclude SSE client in static mode", ({ Given, When, Then }) => {
    Given("liveReload option is false or omitted", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then("no SSE or editing code is included", () => {
      expect(html).not.toContain("EventSource");
      expect(html).not.toContain("connectSSE");
      expect(html).not.toContain("saveSpecBody");
      expect(html).not.toContain("saveFeatureFile");
      // also true when explicitly false
      const htmlFalse = generateHTML(specs, { liveReload: false });
      expect(htmlFalse).not.toContain("EventSource");
      expect(htmlFalse).not.toContain("saveFeatureFile");
    });
  });

  Scenario("Include editing UI in dev mode", ({ Given, When, Then }) => {
    Given("liveReload is true", () => {
      specs = sampleSpecs;
      options = { liveReload: true };
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "edit buttons and save handlers for spec bodies and feature files are embedded",
      () => {
        expect(html).toContain("spec-edit-btn");
        expect(html).toContain("saveSpecBody");
        expect(html).toContain("cancelSpecEdit");
        expect(html).toContain("saveFeatureFile");
        expect(html).toContain("/api/features/");
      },
    );
  });

  Scenario("No external assets", ({ Given, When, Then }) => {
    Given("the generated HTML", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("loaded in a browser", () => {
      html = generateHTML(specs, options);
    });
    Then("only CDN scripts are fetched — no other external requests", () => {
      // No local script/style references; the only src= values are CDN https URLs.
      expect(html).not.toMatch(/<link[^>]+href="[^"]*\.css"/);
      expect(html).not.toMatch(/src="(?!https:\/\/)[^"]*\.js"/);
      const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
        (m) => m[1],
      );
      for (const src of srcs) {
        expect(src.startsWith("https://")).toBe(true);
      }
    });
  });

  Scenario("Embed test-status rendering", ({ Given, When, Then }) => {
    Given("any call to generateHTML", () => {
      specs = sampleSpecs;
      options = undefined;
    });
    When("HTML is produced", () => {
      html = generateHTML(specs, options);
    });
    Then(
      "a statusColor function and status-pill styles are embedded for visualizing test results",
      () => {
        expect(html).toContain("function statusColor");
        expect(html).toContain("status-pill");
      },
    );
  });
});

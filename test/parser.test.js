import { describe, it, expect } from "vitest";
import {
  parseSpecFile,
  parseSpecDirectory,
  parseFeatureFile,
  parseFeatureDirectory,
} from "../src/parser.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

describe("parseSpecFile", () => {
  it("parses a valid spec file with all fields", async () => {
    const result = await parseSpecFile(join(fixturesDir, "valid-spec.md"));

    expect(result).toEqual({
      name: "Bootstrap",
      description: "One-time project scaffolding",
      group: "foundation",
      tags: ["setup", "init"],
      depends_on: [],
      features: "features/bootstrap/",
      body: "# Bootstrap\n\nThis is the bootstrap spec.\n",
    });
  });

  it("parses a spec file with rich depends_on (mixed format)", async () => {
    const result = await parseSpecFile(join(fixturesDir, "with-deps.md"));

    expect(result).toMatchObject({
      name: "Repos",
      description: "Repo onboarding, config parsing, CRUD",
      group: "data",
      tags: ["crud", "api"],
      depends_on: [
        { name: "persistence", uses: ["data-storage", "query-interface"] },
        { name: "server-api", uses: [] },
      ],
      features: "features/repos/",
    });
    expect(result).toHaveProperty("body");
  });

  it("parses a spec file with rich depends_on (single dep with uses)", async () => {
    const result = await parseSpecFile(join(fixturesDir, "single-dep.md"));

    expect(result).toMatchObject({
      name: "Persistence",
      description: "SQLite database layer",
      group: "infrastructure",
      tags: ["database", "storage"],
      depends_on: [
        { name: "bootstrap", uses: ["project-scaffolding"] },
      ],
      features: "features/persistence/",
    });
    expect(result).toHaveProperty("body");
  });

  it("returns null for files without frontmatter", async () => {
    const result = await parseSpecFile(join(fixturesDir, "no-frontmatter.md"));

    expect(result).toBeNull();
  });

  it("defaults optional fields when only name is present", async () => {
    const result = await parseSpecFile(join(fixturesDir, "minimal-spec.md"));

    expect(result).toMatchObject({
      name: "Minimal",
      description: "",
      group: "",
      tags: [],
      depends_on: [],
      features: "",
    });
    expect(typeof result.body).toBe("string");
  });

  it("returns null for files missing the name field", async () => {
    const result = await parseSpecFile(
      join(fixturesDir, "partial-frontmatter.md"),
    );

    expect(result).toBeNull();
  });

  it("includes the markdown body after frontmatter", async () => {
    const result = await parseSpecFile(join(fixturesDir, "valid-spec.md"));

    expect(result.body).toContain("# Bootstrap");
    expect(result.body).toContain("This is the bootstrap spec.");
  });
});

describe("parseSpecDirectory", () => {
  it("parses all valid spec files in a directory", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["Bootstrap", "Minimal", "Persistence", "Repos"]);
  });

  it("skips files without valid modspec frontmatter", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const names = results.map((r) => r.name);
    expect(names).not.toContain(undefined);
    expect(results.length).toBe(4);
  });

  it("returns an empty array for a directory with no markdown files", async () => {
    const results = await parseSpecDirectory(join(fixturesDir, "empty-dir"));
    expect(results).toEqual([]);
  });

  it("includes body for all parsed specs", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    results.forEach((spec) => {
      expect(spec).toHaveProperty("body");
      expect(typeof spec.body).toBe("string");
    });
  });

  it("includes group and tags for parsed specs", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const bootstrap = results.find((s) => s.name === "Bootstrap");
    expect(bootstrap.group).toBe("foundation");
    expect(bootstrap.tags).toEqual(["setup", "init"]);

    const minimal = results.find((s) => s.name === "Minimal");
    expect(minimal.group).toBe("");
    expect(minimal.tags).toEqual([]);
  });

  it("includes featureFiles when projectRoot is provided", async () => {
    const results = await parseSpecDirectory(fixturesDir, {
      projectRoot: fixturesDir,
    });

    const bootstrap = results.find((s) => s.name === "Bootstrap");
    expect(bootstrap.featureFiles).toBeDefined();
    expect(Array.isArray(bootstrap.featureFiles)).toBe(true);
    expect(bootstrap.featureFiles.length).toBe(2);

    const names = bootstrap.featureFiles.map((f) => f.name).sort();
    expect(names).toEqual(["health-endpoint", "project-scaffolding"]);
  });

  it("resolves featureFiles for persistence when projectRoot is provided", async () => {
    const results = await parseSpecDirectory(fixturesDir, {
      projectRoot: fixturesDir,
    });

    const persistence = results.find((s) => s.name === "Persistence");
    expect(persistence.featureFiles).toBeDefined();
    expect(persistence.featureFiles.length).toBe(2);

    const names = persistence.featureFiles.map((f) => f.name).sort();
    expect(names).toEqual(["data-storage", "query-interface"]);
  });

  it("returns empty featureFiles when no projectRoot provided", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const bootstrap = results.find((s) => s.name === "Bootstrap");
    expect(bootstrap.featureFiles).toEqual([]);
  });

  it("normalizes depends_on to {name, uses} format", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const repos = results.find((s) => s.name === "Repos");
    expect(repos.depends_on).toEqual([
      { name: "persistence", uses: ["data-storage", "query-interface"] },
      { name: "server-api", uses: [] },
    ]);
  });
});

describe("parseFeatureFile", () => {
  const featureFixtures = join(fixturesDir, "features", "bootstrap");

  it("extracts kebab-case Feature name from a .feature file", async () => {
    const result = await parseFeatureFile(
      join(featureFixtures, "scaffolding.feature"),
    );

    expect(result.name).toBe("project-scaffolding");
  });

  it("extracts all Scenario names", async () => {
    const result = await parseFeatureFile(
      join(featureFixtures, "scaffolding.feature"),
    );

    expect(result.scenarios).toEqual([
      {
        name: "Clean build with zero warnings",
        steps: [
          "Given a fresh clone of the repository",
          "When I run the build command",
          "Then the build succeeds",
        ],
      },
      {
        name: "All dependencies resolve",
        steps: [
          "Given a fresh clone of the repository",
          "When I install dependencies",
          "Then all dependencies resolve successfully",
        ],
      },
    ]);
  });

  it("includes filename and raw content", async () => {
    const result = await parseFeatureFile(
      join(featureFixtures, "scaffolding.feature"),
    );

    expect(result.filename).toBe("scaffolding.feature");
    expect(result.content).toContain("Feature: project-scaffolding");
  });

  it("includes the relative path", async () => {
    const result = await parseFeatureFile(
      join(featureFixtures, "scaffolding.feature"),
      { basePath: fixturesDir },
    );

    expect(result.path).toBe("features/bootstrap/scaffolding.feature");
  });
});

describe("parseFeatureDirectory", () => {
  it("parses all .feature files in a directory", async () => {
    const results = await parseFeatureDirectory(
      join(fixturesDir, "features", "bootstrap"),
    );

    expect(results.length).toBe(2);
    const names = results.map((f) => f.name).sort();
    expect(names).toEqual(["health-endpoint", "project-scaffolding"]);
  });

  it("returns empty array for nonexistent directory", async () => {
    const results = await parseFeatureDirectory(
      join(fixturesDir, "features", "nonexistent"),
    );

    expect(results).toEqual([]);
  });

  it("returns empty array for directory with no .feature files", async () => {
    const results = await parseFeatureDirectory(
      join(fixturesDir, "empty-dir"),
    );

    expect(results).toEqual([]);
  });
});

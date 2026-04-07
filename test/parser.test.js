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
      depends_on: [],
      features: "features/bootstrap/",
      body: "# Bootstrap\n\nThis is the bootstrap spec.\n",
    });
  });

  it("parses a spec file with multiple dependencies", async () => {
    const result = await parseSpecFile(join(fixturesDir, "with-deps.md"));

    expect(result).toMatchObject({
      name: "Repos",
      description: "Repo onboarding, config parsing, CRUD",
      depends_on: ["persistence", "server-api"],
      features: "features/repos/",
    });
    expect(result).toHaveProperty("body");
  });

  it("parses a spec file with a single dependency", async () => {
    const result = await parseSpecFile(join(fixturesDir, "single-dep.md"));

    expect(result).toMatchObject({
      name: "Persistence",
      description: "SQLite database layer",
      depends_on: ["bootstrap"],
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

  it("includes featureFiles when projectRoot is provided", async () => {
    const results = await parseSpecDirectory(fixturesDir, {
      projectRoot: fixturesDir,
    });

    const bootstrap = results.find((s) => s.name === "Bootstrap");
    expect(bootstrap.featureFiles).toBeDefined();
    expect(Array.isArray(bootstrap.featureFiles)).toBe(true);
    expect(bootstrap.featureFiles.length).toBe(2);

    const names = bootstrap.featureFiles.map((f) => f.name).sort();
    expect(names).toEqual(["Health Endpoint", "Project Scaffolding"]);
  });

  it("returns empty featureFiles when features dir does not exist", async () => {
    const results = await parseSpecDirectory(fixturesDir, {
      projectRoot: fixturesDir,
    });

    const persistence = results.find((s) => s.name === "Persistence");
    expect(persistence.featureFiles).toEqual([]);
  });

  it("returns empty featureFiles when no projectRoot provided", async () => {
    const results = await parseSpecDirectory(fixturesDir);

    const bootstrap = results.find((s) => s.name === "Bootstrap");
    expect(bootstrap.featureFiles).toEqual([]);
  });
});

describe("parseFeatureFile", () => {
  const featureFixtures = join(fixturesDir, "features", "bootstrap");

  it("extracts Feature name from a .feature file", async () => {
    const result = await parseFeatureFile(
      join(featureFixtures, "scaffolding.feature"),
    );

    expect(result.name).toBe("Project Scaffolding");
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
    expect(result.content).toContain("Feature: Project Scaffolding");
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
    expect(names).toEqual(["Health Endpoint", "Project Scaffolding"]);
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

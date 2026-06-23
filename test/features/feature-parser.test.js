import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseFeatureFile,
  parseFeatureDirectory,
} from "../../src/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");
const bootstrapDir = join(fixturesDir, "features", "bootstrap");

const tmpDirs = [];
function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "modspec-feature-"));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const fileParsing = await loadFeature(
  "features/feature-parser/file-parsing.feature",
);

describeFeature(fileParsing, ({ Scenario }) => {
  let filePath;
  let options;
  let result;

  Scenario("Extract feature name from header", ({ Given, When, Then }) => {
    Given('a .feature file starting with "Feature: user-login"', () => {
      const dir = makeTmpDir();
      filePath = join(dir, "login.feature");
      writeFileSync(
        filePath,
        "Feature: user-login\n\n  Scenario: A\n    Given x\n",
        "utf-8",
      );
      options = {};
    });
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then('name is "user-login"', () => {
      expect(result.name).toBe("user-login");
    });
  });

  Scenario("Extract scenarios and steps", ({ Given, When, Then }) => {
    Given(
      "a .feature file with two Scenario blocks containing Given/When/Then steps",
      () => {
        // The scaffolding fixture has exactly two Scenario blocks.
        filePath = join(bootstrapDir, "scaffolding.feature");
        options = {};
      },
    );
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then(
      "scenarios is an array of two objects, each with name and steps array",
      () => {
        expect(Array.isArray(result.scenarios)).toBe(true);
        expect(result.scenarios).toHaveLength(2);
        for (const sc of result.scenarios) {
          expect(typeof sc.name).toBe("string");
          expect(sc.name.length).toBeGreaterThan(0);
          expect(Array.isArray(sc.steps)).toBe(true);
          expect(sc.steps.length).toBeGreaterThan(0);
        }
      },
    );
  });

  Scenario("Capture And/But steps", ({ Given, When, Then }) => {
    Given(
      'a scenario contains "And" and "But" steps after Given/When/Then',
      () => {
        const dir = makeTmpDir();
        filePath = join(dir, "andbut.feature");
        writeFileSync(
          filePath,
          [
            "Feature: and-but",
            "",
            "  Scenario: with and/but",
            "    Given a precondition",
            "    And another precondition",
            "    When an action occurs",
            "    Then an outcome happens",
            "    And a second outcome",
            "    But not this outcome",
            "",
          ].join("\n"),
          "utf-8",
        );
        options = {};
      },
    );
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then(
      "the And/But lines are included in the scenario's steps array",
      () => {
        const steps = result.scenarios[0].steps;
        expect(steps).toContain("And another precondition");
        expect(steps).toContain("And a second outcome");
        expect(steps).toContain("But not this outcome");
      },
    );
  });

  Scenario("Preserve raw content", ({ Given, When, Then }) => {
    Given("any .feature file", () => {
      filePath = join(bootstrapDir, "scaffolding.feature");
      options = {};
    });
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then("the content field contains the full file text unchanged", () => {
      const raw = readFileSync(filePath, "utf-8");
      expect(result.content).toBe(raw);
    });
  });

  Scenario("Compute relative path from basePath", ({ Given, When, Then }) => {
    Given("basePath is provided in options", () => {
      filePath = join(bootstrapDir, "scaffolding.feature");
      options = { basePath: fixturesDir };
    });
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then("path is the file's location relative to basePath", () => {
      expect(result.path).toBe("features/bootstrap/scaffolding.feature");
    });
  });

  Scenario("Return filename", ({ Given, When, Then }) => {
    Given("a file at /project/features/auth/login.feature", () => {
      const dir = makeTmpDir();
      const authDir = join(dir, "features", "auth");
      mkdirSync(authDir, { recursive: true });
      filePath = join(authDir, "login.feature");
      writeFileSync(
        filePath,
        "Feature: login\n\n  Scenario: A\n    Given x\n",
        "utf-8",
      );
      options = {};
    });
    When("parseFeatureFile is called", async () => {
      result = await parseFeatureFile(filePath, options);
    });
    Then('filename is "login.feature"', () => {
      expect(result.filename).toBe("login.feature");
    });
  });
});

const directoryParsing = await loadFeature(
  "features/feature-parser/directory-parsing.feature",
);

describeFeature(directoryParsing, ({ Scenario }) => {
  let dirPath;
  let result;

  function writeFeature(dir, name, featureName) {
    writeFileSync(
      join(dir, name),
      `Feature: ${featureName}\n\n  Scenario: A\n    Given x\n`,
      "utf-8",
    );
  }

  Scenario("Parse all features in a directory", ({ Given, When, Then }) => {
    Given("a directory with three .feature files", () => {
      dirPath = makeTmpDir();
      writeFeature(dirPath, "one.feature", "one");
      writeFeature(dirPath, "two.feature", "two");
      writeFeature(dirPath, "three.feature", "three");
    });
    When("parseFeatureDirectory is called", async () => {
      result = await parseFeatureDirectory(dirPath);
    });
    Then("an array of three parsed feature objects is returned", () => {
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      const names = result.map((f) => f.name).sort();
      expect(names).toEqual(["one", "three", "two"]);
    });
  });

  Scenario(
    "Return empty array for nonexistent directory",
    ({ Given, When, Then }) => {
      Given("a path to a directory that does not exist", () => {
        dirPath = join(makeTmpDir(), "does-not-exist");
      });
      When("parseFeatureDirectory is called", async () => {
        result = await parseFeatureDirectory(dirPath);
      });
      Then("an empty array is returned without throwing", () => {
        expect(result).toEqual([]);
      });
    },
  );

  Scenario("Skip non-feature files", ({ Given, When, Then }) => {
    Given("a directory with .md, .txt, and .feature files", () => {
      dirPath = makeTmpDir();
      writeFeature(dirPath, "real.feature", "real");
      writeFileSync(join(dirPath, "notes.md"), "# notes\n", "utf-8");
      writeFileSync(join(dirPath, "data.txt"), "text\n", "utf-8");
    });
    When("parseFeatureDirectory is called", async () => {
      result = await parseFeatureDirectory(dirPath);
    });
    Then("only .feature files are parsed", () => {
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("real");
      expect(result[0].filename).toBe("real.feature");
    });
  });

  Scenario("Parallel parsing", ({ Given, When, Then }) => {
    Given("a directory with multiple .feature files", () => {
      dirPath = makeTmpDir();
      writeFeature(dirPath, "a.feature", "a");
      writeFeature(dirPath, "b.feature", "b");
      writeFeature(dirPath, "c.feature", "c");
      writeFeature(dirPath, "d.feature", "d");
    });
    When("parseFeatureDirectory is called", async () => {
      // parseFeatureDirectory returns a Promise.all over the files; awaiting
      // resolves all of them concurrently.
      result = await parseFeatureDirectory(dirPath);
    });
    Then("all files are parsed concurrently via Promise.all", () => {
      expect(result).toHaveLength(4);
      const names = result.map((f) => f.name).sort();
      expect(names).toEqual(["a", "b", "c", "d"]);
    });
  });
});

const featureFormat = await loadFeature(
  "features/feature-parser/feature-format.feature",
);

describeFeature(featureFormat, ({ Scenario }) => {
  let filePath;
  let result;

  Scenario("Feature header", ({ Given, When, Then }) => {
    Given("a .feature file", () => {
      const dir = makeTmpDir();
      filePath = join(dir, "header.feature");
      writeFileSync(
        filePath,
        [
          "Feature: feature-name",
          "  An optional description line.",
          "",
          "  Scenario: A",
          "    Given x",
          "",
        ].join("\n"),
        "utf-8",
      );
    });
    When("it follows Gherkin format", async () => {
      result = await parseFeatureFile(filePath);
    });
    Then(
      'it starts with "Feature: feature-name" followed by an optional description',
      () => {
        expect(result.content.startsWith("Feature: feature-name")).toBe(true);
        expect(result.name).toBe("feature-name");
        expect(result.content).toContain("An optional description line.");
      },
    );
  });

  Scenario("Scenario blocks", ({ Given, When, Then }) => {
    Given("a feature file", () => {
      const dir = makeTmpDir();
      filePath = join(dir, "blocks.feature");
      writeFileSync(
        filePath,
        [
          "Feature: blocks",
          "",
          "  Scenario: description",
          "    Given a thing",
          "    When an action",
          "    Then a result",
          "    And more",
          "    But not that",
          "",
        ].join("\n"),
        "utf-8",
      );
    });
    When("scenarios are defined", async () => {
      result = await parseFeatureFile(filePath);
    });
    Then(
      "each starts with \"Scenario: description\" followed by Given/When/Then/And/But steps",
      () => {
        expect(result.scenarios).toHaveLength(1);
        const sc = result.scenarios[0];
        expect(sc.name).toBe("description");
        expect(sc.steps).toEqual([
          "Given a thing",
          "When an action",
          "Then a result",
          "And more",
          "But not that",
        ]);
      },
    );
  });

  Scenario("Kebab-case naming convention", ({ Given, When, Then }) => {
    Given("feature files follow modspec conventions", () => {
      const dir = makeTmpDir();
      filePath = join(dir, "data-querying.feature");
      writeFileSync(
        filePath,
        "Feature: data-querying\n\n  Scenario: A\n    Given x\n",
        "utf-8",
      );
    });
    When("named", async () => {
      result = await parseFeatureFile(filePath);
    });
    Then(
      'feature names and filenames use kebab-case (e.g., "data-querying.feature")',
      () => {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        expect(result.name).toBe("data-querying");
        expect(kebab.test(result.name)).toBe(true);
        expect(result.filename).toBe("data-querying.feature");
        expect(kebab.test(result.filename.replace(/\.feature$/, ""))).toBe(
          true,
        );
      },
    );
  });
});

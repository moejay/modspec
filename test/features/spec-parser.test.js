import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSpecFile, parseSpecDirectory } from "../../src/parser.js";
import { buildAdjacency } from "../../src/cycles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

const tmpDirs = [];
function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), "modspec-spec-"));
  tmpDirs.push(dir);
  return dir;
}
function writeSpec(dir, name, contents) {
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const specFileParsing = await loadFeature(
  "features/spec-parser/spec-file-parsing.feature",
);

describeFeature(specFileParsing, ({ Scenario }) => {
  let filePath;
  let result;

  Scenario("Parse valid spec with all fields", ({ Given, When, Then }) => {
    Given(
      "a .md file with name, description, group, tags, depends_on, and features in frontmatter",
      () => {
        const dir = makeTmpDir();
        filePath = writeSpec(
          dir,
          "full.md",
          [
            "---",
            "name: Full",
            "description: A complete spec",
            "group: core",
            "tags: [one, two]",
            "depends_on:",
            "  - config",
            "features: features/full/",
            "---",
            "",
            "# Full",
            "",
            "Body text.",
            "",
          ].join("\n"),
        );
      },
    );
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then(
      "a spec object is returned with all fields populated and body trimmed",
      () => {
        expect(result).toMatchObject({
          name: "Full",
          description: "A complete spec",
          group: "core",
          tags: ["one", "two"],
          depends_on: [{ name: "config", uses: [] }],
          features: "features/full/",
        });
        expect(result.body).toBe("# Full\n\nBody text.\n");
      },
    );
  });

  Scenario("Parse minimal spec with only name", ({ Given, When, Then }) => {
    Given("a .md file with only name in frontmatter", () => {
      filePath = join(fixturesDir, "minimal-spec.md");
    });
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then(
      'description defaults to "", group to "", tags to [], depends_on to [], features to ""',
      () => {
        expect(result.description).toBe("");
        expect(result.group).toBe("");
        expect(result.tags).toEqual([]);
        expect(result.depends_on).toEqual([]);
        expect(result.features).toBe("");
      },
    );
  });

  Scenario("Return null for missing name", ({ Given, When, Then }) => {
    Given("a .md file with frontmatter but no name field", () => {
      filePath = join(fixturesDir, "partial-frontmatter.md");
    });
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then("null is returned", () => {
      expect(result).toBeNull();
    });
  });

  Scenario("Normalize string dependency", ({ Given, When, Then }) => {
    Given('depends_on contains a plain string "config"', () => {
      const dir = makeTmpDir();
      filePath = writeSpec(
        dir,
        "strdep.md",
        ["---", "name: StrDep", "depends_on:", "  - config", "---", "", "# StrDep", ""].join(
          "\n",
        ),
      );
    });
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then('the entry is normalized to { name: "config", uses: [] }', () => {
      expect(result.depends_on).toEqual([{ name: "config", uses: [] }]);
    });
  });

  Scenario("Normalize object dependency with uses", ({ Given, When, Then }) => {
    Given(
      'depends_on contains { name: "auth", uses: ["login", "session"] }',
      () => {
        const dir = makeTmpDir();
        filePath = writeSpec(
          dir,
          "objdep.md",
          [
            "---",
            "name: ObjDep",
            "depends_on:",
            "  - name: auth",
            "    uses: [login, session]",
            "---",
            "",
            "# ObjDep",
            "",
          ].join("\n"),
        );
      },
    );
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then(
      'the entry is preserved as { name: "auth", uses: ["login", "session"] }',
      () => {
        expect(result.depends_on).toEqual([
          { name: "auth", uses: ["login", "session"] },
        ]);
      },
    );
  });

  Scenario("Filter invalid dependency entries", ({ Given, When, Then }) => {
    Given("depends_on contains an object without a name field", () => {
      const dir = makeTmpDir();
      filePath = writeSpec(
        dir,
        "baddep.md",
        [
          "---",
          "name: BadDep",
          "depends_on:",
          "  - name: valid",
          "  - uses: [orphaned]",
          "---",
          "",
          "# BadDep",
          "",
        ].join("\n"),
      );
    });
    When("parseSpecFile is called", async () => {
      result = await parseSpecFile(filePath);
    });
    Then("the invalid entry is filtered out", () => {
      expect(result.depends_on).toEqual([{ name: "valid", uses: [] }]);
    });
  });
});

const directoryParsing = await loadFeature(
  "features/spec-parser/directory-parsing.feature",
);

describeFeature(directoryParsing, ({ Scenario }) => {
  let dirPath;
  let options;
  let result;

  Scenario("Parse multiple spec files", ({ Given, When, Then }) => {
    Given(
      "a directory with three .md files, two valid and one without name",
      () => {
        dirPath = makeTmpDir();
        options = {};
        writeSpec(
          dirPath,
          "a.md",
          ["---", "name: Alpha", "---", "", "# Alpha", ""].join("\n"),
        );
        writeSpec(
          dirPath,
          "b.md",
          ["---", "name: Beta", "---", "", "# Beta", ""].join("\n"),
        );
        writeSpec(
          dirPath,
          "c.md",
          ["---", "description: no name here", "---", "", "# Nameless", ""].join(
            "\n",
          ),
        );
      },
    );
    When("parseSpecDirectory is called", async () => {
      result = await parseSpecDirectory(dirPath, options);
    });
    Then("two spec objects are returned", () => {
      expect(result).toHaveLength(2);
      const names = result.map((s) => s.name).sort();
      expect(names).toEqual(["Alpha", "Beta"]);
    });
  });

  Scenario(
    "Resolve feature files with projectRoot",
    ({ Given, When, Then }) => {
      Given(
        'a spec has features: "features/auth/" and projectRoot is provided',
        () => {
          // Use the fixtures tree: a spec whose features point at an existing
          // feature directory, with projectRoot set so paths resolve.
          dirPath = makeTmpDir();
          writeSpec(
            dirPath,
            "auth.md",
            [
              "---",
              "name: Auth",
              "features: features/auth/",
              "---",
              "",
              "# Auth",
              "",
            ].join("\n"),
          );
          // Create the referenced feature directory under the same root.
          const authFeatures = join(dirPath, "features", "auth");
          mkdirSync(authFeatures, { recursive: true });
          writeFileSync(
            join(authFeatures, "login.feature"),
            "Feature: login\n\n  Scenario: A\n    Given x\n",
            "utf-8",
          );
          writeFileSync(
            join(authFeatures, "logout.feature"),
            "Feature: logout\n\n  Scenario: A\n    Given x\n",
            "utf-8",
          );
          options = { projectRoot: dirPath };
        },
      );
      When("parseSpecDirectory is called", async () => {
        result = await parseSpecDirectory(dirPath, options);
      });
      Then(
        "featureFiles is populated by parsing projectRoot/features/auth/*.feature",
        () => {
          const auth = result.find((s) => s.name === "Auth");
          expect(auth.featureFiles).toHaveLength(2);
          const names = auth.featureFiles.map((f) => f.name).sort();
          expect(names).toEqual(["login", "logout"]);
        },
      );
    },
  );

  Scenario("Empty featureFiles when no features path", ({ Given, When, Then }) => {
    Given("a spec has no features field", () => {
      dirPath = makeTmpDir();
      writeSpec(
        dirPath,
        "nofeatures.md",
        ["---", "name: NoFeatures", "---", "", "# NoFeatures", ""].join("\n"),
      );
      options = { projectRoot: dirPath };
    });
    When("parseSpecDirectory is called", async () => {
      result = await parseSpecDirectory(dirPath, options);
    });
    Then("featureFiles is an empty array", () => {
      const spec = result.find((s) => s.name === "NoFeatures");
      expect(spec.featureFiles).toEqual([]);
    });
  });

  Scenario("Handle directory with no .md files", ({ Given, When, Then }) => {
    Given("a directory with only non-.md files", () => {
      dirPath = makeTmpDir();
      options = {};
      writeFileSync(join(dirPath, "readme.txt"), "text\n", "utf-8");
      writeFileSync(join(dirPath, "data.json"), "{}\n", "utf-8");
    });
    When("parseSpecDirectory is called", async () => {
      result = await parseSpecDirectory(dirPath, options);
    });
    Then("an empty array is returned", () => {
      expect(result).toEqual([]);
    });
  });
});

const specFormat = await loadFeature(
  "features/spec-parser/spec-format.feature",
);

describeFeature(specFormat, ({ Scenario }) => {
  let filePath;
  let result;
  let specs;
  let adjacency;

  Scenario("Valid frontmatter structure", ({ Given, When, Then, And }) => {
    Given("a markdown file following the modspec format", () => {
      const dir = makeTmpDir();
      filePath = writeSpec(
        dir,
        "canonical.md",
        [
          "---",
          "name: Canonical",
          "description: A canonical spec",
          "group: core",
          "tags: [a, b]",
          "depends_on:",
          "  - other",
          "features: features/canonical/",
          "---",
          "",
          "# Canonical",
          "",
          "Markdown body below the fences.",
          "",
        ].join("\n"),
      );
    });
    When("it is valid", async () => {
      result = await parseSpecFile(filePath);
    });
    Then(
      "it has YAML frontmatter with name (required), description, group, tags, depends_on, features",
      () => {
        expect(result).not.toBeNull();
        expect(result.name).toBe("Canonical");
        expect(result.description).toBe("A canonical spec");
        expect(result.group).toBe("core");
        expect(result.tags).toEqual(["a", "b"]);
        expect(result.depends_on).toEqual([{ name: "other", uses: [] }]);
        expect(result.features).toBe("features/canonical/");
      },
    );
    And("a markdown body below the frontmatter fences", () => {
      expect(result.body).toContain("# Canonical");
      expect(result.body).toContain("Markdown body below the fences.");
    });
  });

  Scenario(
    "Mixed dependency formats in depends_on",
    ({ Given, When, Then }) => {
      Given(
        "a spec lists dependencies as both strings and {name, uses} objects",
        () => {
          // Reuse the with-deps fixture: one object dep with uses, one string dep.
          filePath = join(fixturesDir, "with-deps.md");
        },
      );
      When("the file is parsed", async () => {
        result = await parseSpecFile(filePath);
      });
      Then(
        "all entries are normalized to the canonical { name: string, uses: string[] } shape",
        () => {
          expect(result.depends_on).toEqual([
            { name: "persistence", uses: ["data-storage", "query-interface"] },
            { name: "server-api", uses: [] },
          ]);
          for (const dep of result.depends_on) {
            expect(typeof dep.name).toBe("string");
            expect(Array.isArray(dep.uses)).toBe(true);
          }
        },
      );
    },
  );

  Scenario(
    "Case-insensitive dependency matching",
    ({ Given, When, Then }) => {
      Given(
        'a spec depends_on "Auth" and another spec\'s name is "auth"',
        () => {
          specs = [
            {
              name: "consumer",
              depends_on: [{ name: "Auth", uses: [] }],
            },
            {
              name: "auth",
              depends_on: [],
            },
          ];
        },
      );
      When("dependencies are resolved", () => {
        adjacency = buildAdjacency(specs);
      });
      Then("the dependency matches regardless of case", () => {
        // buildAdjacency resolves "Auth" to the actual spec named "auth".
        expect(adjacency.adj.consumer).toEqual(["auth"]);
      });
    },
  );
});

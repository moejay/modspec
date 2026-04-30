import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { listCommand } from "../../src/commands.js";

function makeSpec(props = {}) {
  return {
    name: "",
    description: "",
    group: "",
    tags: [],
    depends_on: [],
    features: "",
    body: "",
    featureFiles: [],
    specPath: "",
    ...props,
  };
}

const listFeature = await loadFeature("features/cli-commands/list.feature");

describeFeature(listFeature, ({ Scenario }) => {
  let specs;
  let result;

  Scenario(
    "Text output lists specs grouped by group, then name",
    ({ Given, And, When, Then }) => {
      Given(
        'a spec directory with specs "auth", "persistence", "bootstrap"',
        () => {
          specs = [
            makeSpec({ name: "auth" }),
            makeSpec({ name: "persistence" }),
            makeSpec({ name: "bootstrap" }),
          ];
        },
      );
      And('"auth" and "persistence" share group "infrastructure"', () => {
        specs.find((s) => s.name === "auth").group = "infrastructure";
        specs.find((s) => s.name === "persistence").group = "infrastructure";
      });
      And('"bootstrap" has group "foundation"', () => {
        specs.find((s) => s.name === "bootstrap").group = "foundation";
      });
      When("the list command runs without --json", () => {
        result = listCommand(specs, { json: false });
      });
      Then(
        'the output groups specs as "foundation" before "infrastructure"',
        () => {
          const idxFoundation = result.output.indexOf("foundation");
          const idxInfra = result.output.indexOf("infrastructure");
          expect(idxFoundation).toBeGreaterThanOrEqual(0);
          expect(idxInfra).toBeGreaterThan(idxFoundation);
        },
      );
      And("within each group, specs appear sorted by name", () => {
        const idxAuth = result.output.indexOf("auth");
        const idxPersistence = result.output.indexOf("persistence");
        expect(idxAuth).toBeLessThan(idxPersistence);
      });
    },
  );

  Scenario(
    "Text output shows name, group, dep count, feature count",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" in group "infrastructure" with 2 dependencies and 3 features',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              group: "infrastructure",
              depends_on: [
                { name: "a", uses: [] },
                { name: "b", uses: [] },
              ],
              featureFiles: [
                { name: "f1", scenarios: [], path: "" },
                { name: "f2", scenarios: [], path: "" },
                { name: "f3", scenarios: [], path: "" },
              ],
            }),
          ];
        },
      );
      When("the list command runs without --json", () => {
        result = listCommand(specs, { json: false });
      });
      Then(
        'the line for "auth" includes "auth", "infrastructure", "2 deps", "3 features"',
        () => {
          const line = result.output
            .split("\n")
            .find((l) => l.includes("auth"));
          expect(line).toContain("auth");
          expect(line).toContain("infrastructure");
          expect(line).toContain("2 deps");
          expect(line).toContain("3 features");
        },
      );
    },
  );

  Scenario(
    "JSON output emits an array of spec metadata",
    ({ Given, When, Then, And }) => {
      Given("a spec directory with two specs", () => {
        specs = [makeSpec({ name: "a" }), makeSpec({ name: "b" })];
      });
      When("the list command runs with --json", () => {
        result = listCommand(specs, { json: true });
      });
      Then(
        "the output is valid JSON containing an array of length 2",
        () => {
          const parsed = JSON.parse(result.output);
          expect(Array.isArray(parsed)).toBe(true);
          expect(parsed).toHaveLength(2);
        },
      );
      And(
        "each entry has fields: name, group, description, tags, dependsOn, features, specPath",
        () => {
          const parsed = JSON.parse(result.output);
          const fields = [
            "name",
            "group",
            "description",
            "tags",
            "dependsOn",
            "features",
            "specPath",
          ];
          parsed.forEach((entry) => {
            fields.forEach((f) => expect(entry).toHaveProperty(f));
          });
        },
      );
    },
  );

  Scenario(
    "JSON spec entries include relative file paths",
    ({ Given, When, Then }) => {
      Given('a spec "auth" stored at "spec/auth.md"', () => {
        specs = [makeSpec({ name: "auth", specPath: "spec/auth.md" })];
      });
      When("the list command runs with --json", () => {
        result = listCommand(specs, { json: true });
      });
      Then('the entry for "auth" has specPath "spec/auth.md"', () => {
        const parsed = JSON.parse(result.output);
        const entry = parsed.find((e) => e.name === "auth");
        expect(entry.specPath).toBe("spec/auth.md");
      });
    },
  );

  Scenario("JSON order matches text order", ({ Given, When, Then }) => {
    Given("multiple specs across multiple groups", () => {
      specs = [
        makeSpec({ name: "z-other", group: "alpha" }),
        makeSpec({ name: "a-first", group: "beta" }),
        makeSpec({ name: "m-mid", group: "alpha" }),
      ];
    });
    When("the list command runs with --json", () => {
      result = listCommand(specs, { json: true });
    });
    Then("the JSON array is ordered by group, then name", () => {
      const parsed = JSON.parse(result.output);
      expect(parsed.map((e) => e.name)).toEqual([
        "m-mid",
        "z-other",
        "a-first",
      ]);
    });
  });
});

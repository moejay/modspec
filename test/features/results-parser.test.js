import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, isAbsolute } from "path";
import {
  deriveScenarioStatus,
  normalizeResults,
  parseResultsFile,
  resolveResultsPath,
  mergeResults,
} from "../../src/results.js";

function steps(statuses) {
  return statuses.map((status) => ({ result: { status } }));
}

const tmpDirs = [];
function makeProject(files) {
  const root = mkdtempSync(join(tmpdir(), "modspec-results-"));
  tmpDirs.push(root);
  for (const rel of files) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "[]", "utf-8");
  }
  return root;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const parsing = await loadFeature(
  "features/results-parser/results-parsing.feature",
);

describeFeature(parsing, ({ Scenario }) => {
  let input;
  let result;

  Scenario("Scenario passes when all steps pass", ({ Given, When, Then }) => {
    Given('a scenario whose steps all have status "passed"', () => {
      input = steps(["passed", "passed", "passed"]);
    });
    When("deriveScenarioStatus is called", () => {
      result = deriveScenarioStatus(input);
    });
    Then('the derived status is "passed"', () => {
      expect(result).toBe("passed");
    });
  });

  Scenario("Scenario fails when any step fails", ({ Given, When, Then }) => {
    Given('a scenario with steps having statuses ["passed", "failed", "passed"]', () => {
      input = steps(["passed", "failed", "passed"]);
    });
    When("deriveScenarioStatus is called", () => {
      result = deriveScenarioStatus(input);
    });
    Then('the derived status is "failed"', () => {
      expect(result).toBe("failed");
    });
  });

  Scenario("Status follows severity precedence", ({ Given, When, Then }) => {
    Given('a scenario with steps having statuses ["passed", "skipped", "pending"]', () => {
      input = steps(["passed", "skipped", "pending"]);
    });
    When("deriveScenarioStatus is called", () => {
      result = deriveScenarioStatus(input);
    });
    Then('the derived status is "pending"', () => {
      expect(result).toBe("pending");
    });
  });

  Scenario("Scenario with no steps is undefined", ({ Given, When, Then }) => {
    Given("a scenario with an empty steps array", () => {
      input = [];
    });
    When("deriveScenarioStatus is called", () => {
      result = deriveScenarioStatus(input);
    });
    Then('the derived status is "undefined"', () => {
      expect(result).toBe("undefined");
    });
  });

  Scenario("Normalize a report into a feature and scenario lookup", ({ Given, When, Then }) => {
    Given('a Cucumber JSON report for feature "user-login" with a passing scenario "Successful login"', () => {
      input = [
        {
          name: "user-login",
          elements: [
            {
              type: "scenario",
              name: "Successful login",
              steps: steps(["passed"]),
            },
          ],
        },
      ];
    });
    When("normalizeResults is called", () => {
      result = normalizeResults(input);
    });
    Then('the lookup has feature "user-login" with scenario "Successful login" set to "passed"', () => {
      expect(result["user-login"].scenarios["Successful login"]).toBe("passed");
    });
  });

  Scenario("Accept a JSON string as input", ({ Given, When, Then }) => {
    Given("the same report serialized as a JSON string", () => {
      input = JSON.stringify([
        {
          name: "user-login",
          elements: [
            {
              type: "scenario",
              name: "Successful login",
              steps: steps(["passed"]),
            },
          ],
        },
      ]);
    });
    When("normalizeResults is called", () => {
      result = normalizeResults(input);
    });
    Then('the lookup has feature "user-login" with scenario "Successful login" set to "passed"', () => {
      expect(result["user-login"].scenarios["Successful login"]).toBe("passed");
    });
  });

  Scenario("Normalize a Jest/vitest JSON report", ({ Given, When, Then }) => {
    Given('a vitest JSON report with a passing "it" test "Successful login" under describe "user-login"', () => {
      input = {
        testResults: [
          {
            name: "/abs/login.test.js",
            assertionResults: [
              {
                ancestorTitles: ["user-login"],
                title: "Successful login",
                status: "passed",
              },
            ],
          },
        ],
      };
    });
    When("normalizeResults is called", () => {
      result = normalizeResults(input);
    });
    Then('the lookup has feature "user-login" with scenario "Successful login" set to "passed"', () => {
      expect(result["user-login"].scenarios["Successful login"]).toBe("passed");
    });
  });

  Scenario("Roll vitest-cucumber steps up to a scenario status", ({ Given, When, Then }) => {
    Given('a vitest report with steps under "Feature: user-login" and "Scenario: Bad password" where one step failed', () => {
      const anc = ["Feature: user-login", "Scenario: Bad password"];
      input = {
        testResults: [
          {
            name: "/abs/login.test.js",
            assertionResults: [
              { ancestorTitles: anc, title: "Given a user", status: "passed" },
              { ancestorTitles: anc, title: "When wrong password", status: "passed" },
              { ancestorTitles: anc, title: "Then access denied", status: "failed" },
            ],
          },
        ],
      };
    });
    When("normalizeResults is called", () => {
      result = normalizeResults(input);
    });
    Then('the lookup has feature "user-login" with scenario "Bad password" set to "failed"', () => {
      expect(result["user-login"].scenarios["Bad password"]).toBe("failed");
    });
  });

  Scenario("Missing results file returns null", ({ Given, When, Then }) => {
    Given("a path to a results file that does not exist", () => {
      input = "/no/such/path/results.json";
    });
    When("parseResultsFile is called", async () => {
      result = await parseResultsFile(input);
    });
    Then("the result is null", () => {
      expect(result).toBeNull();
    });
  });
});

const merge = await loadFeature(
  "features/results-parser/results-merge.feature",
);

describeFeature(merge, ({ Scenario }) => {
  let specs;
  let lookup;

  function specWith(featureName, scenarioNames) {
    return {
      name: "demo",
      featureFiles: [
        {
          name: featureName,
          scenarios: scenarioNames.map((name) => ({ name, steps: [] })),
        },
      ],
    };
  }

  Scenario("Annotate matching scenarios with their status", ({ Given, And, When, Then }) => {
    Given('a spec with a feature "user-login" containing scenario "Successful login"', () => {
      specs = [specWith("user-login", ["Successful login"])];
    });
    And('a results lookup marking "Successful login" as "passed"', () => {
      lookup = { "user-login": { name: "user-login", scenarios: { "Successful login": "passed" } } };
    });
    When("mergeResults is called", () => {
      mergeResults(specs, lookup);
    });
    Then('the scenario "Successful login" has status "passed"', () => {
      expect(specs[0].featureFiles[0].scenarios[0].status).toBe("passed");
    });
  });

  Scenario("Scenario with no matching result gets null status", ({ Given, And, When, Then }) => {
    Given('a spec with a feature "user-login" containing scenario "Forgotten password"', () => {
      specs = [specWith("user-login", ["Forgotten password"])];
    });
    And('a results lookup that has no entry for "Forgotten password"', () => {
      lookup = { "user-login": { name: "user-login", scenarios: {} } };
    });
    When("mergeResults is called", () => {
      mergeResults(specs, lookup);
    });
    Then('the scenario "Forgotten password" has status null', () => {
      expect(specs[0].featureFiles[0].scenarios[0].status).toBeNull();
    });
  });

  Scenario("Compute feature-level rollup and counts", ({ Given, When, Then, And }) => {
    Given('a spec feature with scenarios statuses ["passed", "failed"]', () => {
      specs = [specWith("user-login", ["a", "b"])];
      lookup = { "user-login": { name: "user-login", scenarios: { a: "passed", b: "failed" } } };
    });
    When("mergeResults is called", () => {
      mergeResults(specs, lookup);
    });
    Then('the feature testStatus is "failed"', () => {
      expect(specs[0].featureFiles[0].testStatus).toBe("failed");
    });
    And("the feature testCounts are passed 1 failed 1 total 2", () => {
      expect(specs[0].featureFiles[0].testCounts).toEqual({ passed: 1, failed: 1, total: 2 });
    });
  });

  Scenario("Compute spec-level rollup across features", ({ Given, When, Then }) => {
    Given("a spec with one all-passing feature and one feature containing a failure", () => {
      specs = [
        {
          name: "demo",
          featureFiles: [
            { name: "f1", scenarios: [{ name: "a", steps: [] }] },
            { name: "f2", scenarios: [{ name: "b", steps: [] }] },
          ],
        },
      ];
      lookup = {
        f1: { name: "f1", scenarios: { a: "passed" } },
        f2: { name: "f2", scenarios: { b: "failed" } },
      };
    });
    When("mergeResults is called", () => {
      mergeResults(specs, lookup);
    });
    Then('the spec testStatus is "failed"', () => {
      expect(specs[0].testStatus).toBe("failed");
    });
  });

  Scenario("Spec with no matching results has null test status", ({ Given, When, Then, And }) => {
    Given("a spec whose scenarios have no entries in the results lookup", () => {
      specs = [specWith("user-login", ["a", "b"])];
      lookup = {};
    });
    When("mergeResults is called", () => {
      mergeResults(specs, lookup);
    });
    Then("the spec testStatus is null", () => {
      expect(specs[0].testStatus).toBeNull();
    });
    And("the spec testCounts total is 0", () => {
      expect(specs[0].testCounts.total).toBe(0);
    });
  });
});

const discovery = await loadFeature(
  "features/results-parser/results-discovery.feature",
);

describeFeature(discovery, ({ Scenario }) => {
  let projectRoot;
  let explicit;
  let result;

  Scenario("Explicit path takes precedence and is resolved to absolute", ({ Given, When, Then }) => {
    Given('an explicit results path "out/my-report.json"', () => {
      projectRoot = process.cwd();
      explicit = "out/my-report.json";
    });
    When("resolveResultsPath is called", () => {
      result = resolveResultsPath(projectRoot, explicit);
    });
    Then("it returns that path resolved to an absolute path", () => {
      expect(isAbsolute(result)).toBe(true);
      expect(result).toBe(resolve(explicit));
    });
  });

  Scenario("Auto-detect a results file in a conventional directory", ({ Given, And, When, Then }) => {
    Given('a project containing "results/cucumber.json"', () => {
      projectRoot = makeProject(["results/cucumber.json"]);
    });
    And("no explicit results path", () => {
      explicit = null;
    });
    When("resolveResultsPath is called", () => {
      result = resolveResultsPath(projectRoot, explicit);
    });
    Then('it returns the path to "results/cucumber.json"', () => {
      expect(result).toBe(join(projectRoot, "results", "cucumber.json"));
    });
  });

  Scenario("Root-level report is preferred over a directory report", ({ Given, And, When, Then }) => {
    Given('a project containing both "cucumber.json" and "results/cucumber.json"', () => {
      projectRoot = makeProject(["cucumber.json", "results/cucumber.json"]);
    });
    And("no explicit results path", () => {
      explicit = null;
    });
    When("resolveResultsPath is called", () => {
      result = resolveResultsPath(projectRoot, explicit);
    });
    Then('it returns the root-level "cucumber.json"', () => {
      expect(result).toBe(join(projectRoot, "cucumber.json"));
    });
  });

  Scenario("No recognized results file returns null", ({ Given, And, When, Then }) => {
    Given("a project with no recognized results files", () => {
      projectRoot = makeProject([]);
    });
    And("no explicit results path", () => {
      explicit = null;
    });
    When("resolveResultsPath is called", () => {
      result = resolveResultsPath(projectRoot, explicit);
    });
    Then("it returns null", () => {
      expect(result).toBeNull();
    });
  });
});

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  depsCommand,
  featuresCommand,
  showCommand,
  validateCommand,
} from "../../src/commands.js";

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

function feature(name, scenarioNames = [], path = "") {
  return {
    name,
    path,
    scenarios: scenarioNames.map((n) => ({ name: n })),
  };
}

// ---------------------------------------------------------------------------
// deps.feature
// ---------------------------------------------------------------------------
const depsFeature = await loadFeature("features/cli-commands/deps.feature");

describeFeature(depsFeature, ({ Scenario }) => {
  let specs;
  let result;

  Scenario(
    "Text output shows forward deps as a tree",
    ({ Given, When, Then }) => {
      Given(
        'a chain "auth" depends on "persistence" depends on "bootstrap"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              depends_on: [{ name: "persistence", uses: [] }],
            }),
            makeSpec({
              name: "persistence",
              depends_on: [{ name: "bootstrap", uses: [] }],
            }),
            makeSpec({ name: "bootstrap" }),
          ];
        },
      );
      When('the deps command runs for "auth"', () => {
        result = depsCommand(specs, { name: "auth", json: false });
      });
      Then(
        'forward deps include "persistence" and "bootstrap" with indentation showing depth',
        () => {
          const lines = result.output.split("\n");
          const persLine = lines.find((l) => l.includes("persistence"));
          const bootLine = lines.find((l) => l.includes("bootstrap"));
          expect(persLine).toBeDefined();
          expect(bootLine).toBeDefined();
          const indent = (l) => l.length - l.trimStart().length;
          // bootstrap is deeper than persistence
          expect(indent(bootLine)).toBeGreaterThan(indent(persLine));
        },
      );
    },
  );

  Scenario(
    "Text output shows reverse deps as a tree",
    ({ Given, When, Then }) => {
      Given(
        '"repos" depends on "auth" and "audit" depends on "repos"',
        () => {
          specs = [
            makeSpec({ name: "auth" }),
            makeSpec({
              name: "repos",
              depends_on: [{ name: "auth", uses: [] }],
            }),
            makeSpec({
              name: "audit",
              depends_on: [{ name: "repos", uses: [] }],
            }),
          ];
        },
      );
      When('the deps command runs for "auth"', () => {
        result = depsCommand(specs, { name: "auth", json: false });
      });
      Then(
        'reverse deps include "repos" and "audit" with indentation showing depth',
        () => {
          const reverseSection = result.output.split("reverse")[1];
          expect(reverseSection).toContain("repos");
          expect(reverseSection).toContain("audit");
          const lines = reverseSection.split("\n");
          const reposLine = lines.find((l) => l.includes("repos"));
          const auditLine = lines.find((l) => l.includes("audit"));
          const indent = (l) => l.length - l.trimStart().length;
          expect(indent(auditLine)).toBeGreaterThan(indent(reposLine));
        },
      );
    },
  );

  Scenario(
    "Text output labels edges with uses references",
    ({ Given, When, Then }) => {
      Given(
        '"auth" depends on "persistence" with uses "data-storage"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              depends_on: [{ name: "persistence", uses: ["data-storage"] }],
            }),
            makeSpec({ name: "persistence" }),
          ];
        },
      );
      When('the deps command runs for "auth"', () => {
        result = depsCommand(specs, { name: "auth", json: false });
      });
      Then(
        'the edge from "auth" to "persistence" is labeled "uses: data-storage"',
        () => {
          const line = result.output
            .split("\n")
            .find((l) => l.includes("persistence"));
          expect(line).toContain("uses: data-storage");
        },
      );
    },
  );

  Scenario(
    "JSON output returns flat transitive arrays",
    ({ Given, When, Then, And }) => {
      Given(
        'a chain "auth" depends on "persistence" depends on "bootstrap"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              depends_on: [{ name: "persistence", uses: [] }],
            }),
            makeSpec({
              name: "persistence",
              depends_on: [{ name: "bootstrap", uses: [] }],
            }),
            makeSpec({ name: "bootstrap" }),
          ];
        },
      );
      When('the deps command runs for "auth" with --json', () => {
        result = depsCommand(specs, { name: "auth", json: true });
      });
      Then(
        'the JSON object has fields "dependsOn" and "dependents"',
        () => {
          const parsed = JSON.parse(result.output);
          expect(parsed).toHaveProperty("dependsOn");
          expect(parsed).toHaveProperty("dependents");
        },
      );
      And('dependsOn contains both "persistence" and "bootstrap"', () => {
        const parsed = JSON.parse(result.output);
        const names = parsed.dependsOn.map((e) => e.name);
        expect(names).toContain("persistence");
        expect(names).toContain("bootstrap");
      });
    },
  );

  Scenario("Error when spec name not found", ({ Given, When, Then, And }) => {
    Given('a spec directory with no spec named "missing"', () => {
      specs = [makeSpec({ name: "auth" })];
    });
    When('the deps command runs for "missing"', () => {
      result = depsCommand(specs, { name: "missing", json: false });
    });
    Then('an error is reported: "spec not found: missing"', () => {
      expect(result.output).toContain("spec not found: missing");
    });
    And("the exit code is non-zero", () => {
      expect(result.exitCode).not.toBe(0);
    });
  });

  Scenario(
    "A spec with no dependencies prints empty forward section",
    ({ Given, When, Then }) => {
      Given('a spec "bootstrap" with no depends_on', () => {
        specs = [makeSpec({ name: "bootstrap" })];
      });
      When('the deps command runs for "bootstrap"', () => {
        result = depsCommand(specs, { name: "bootstrap", json: false });
      });
      Then(
        "the forward deps section is empty or marked as none",
        () => {
          const forwardSection = result.output
            .split("reverse")[0]
            .split("forward")[1];
          expect(forwardSection).toContain("(none)");
        },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// features.feature
// ---------------------------------------------------------------------------
const featuresFeature = await loadFeature(
  "features/cli-commands/features.feature",
);

describeFeature(featuresFeature, ({ Scenario }) => {
  let specs;
  let result;

  Scenario(
    "Text output without spec name lists all features grouped by spec",
    ({ Given, When, Then }) => {
      Given('two specs "auth" and "persistence" each with features', () => {
        specs = [
          makeSpec({ name: "auth", featureFiles: [feature("login", ["s1"])] }),
          makeSpec({
            name: "persistence",
            featureFiles: [feature("storage", ["s1"])],
          }),
        ];
      });
      When("the features command runs without a spec name", () => {
        result = featuresCommand(specs, { json: false });
      });
      Then(
        'the output groups features under "auth" and "persistence" headings',
        () => {
          expect(result.output).toContain("auth:");
          expect(result.output).toContain("persistence:");
        },
      );
    },
  );

  Scenario(
    "Text output with spec name lists only that spec's features",
    ({ Given, When, Then, And }) => {
      Given(
        'a spec "auth" with two features and a spec "persistence" with one feature',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              featureFiles: [feature("login", []), feature("logout", [])],
            }),
            makeSpec({
              name: "persistence",
              featureFiles: [feature("storage", [])],
            }),
          ];
        },
      );
      When('the features command runs for spec "auth"', () => {
        result = featuresCommand(specs, { name: "auth", json: false });
      });
      Then("only auth's two features are printed", () => {
        expect(result.output).toContain("login");
        expect(result.output).toContain("logout");
      });
      And("persistence's feature is not printed", () => {
        expect(result.output).not.toContain("storage");
      });
    },
  );

  Scenario(
    "Text output shows feature name, scenario count, and path",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" with feature "user-login" containing 3 scenarios at "features/auth/user-login.feature"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              featureFiles: [
                feature(
                  "user-login",
                  ["a", "b", "c"],
                  "features/auth/user-login.feature",
                ),
              ],
            }),
          ];
        },
      );
      When('the features command runs for spec "auth"', () => {
        result = featuresCommand(specs, { name: "auth", json: false });
      });
      Then(
        'the line for "user-login" includes "3 scenarios" and "features/auth/user-login.feature"',
        () => {
          const line = result.output
            .split("\n")
            .find((l) => l.includes("user-login"));
          expect(line).toContain("3 scenarios");
          expect(line).toContain("features/auth/user-login.feature");
        },
      );
    },
  );

  Scenario(
    "JSON output without spec name returns a flat array of all features",
    ({ Given, When, Then, And }) => {
      Given("two specs each with one feature", () => {
        specs = [
          makeSpec({
            name: "auth",
            featureFiles: [feature("login", ["s1"], "p1")],
          }),
          makeSpec({
            name: "persistence",
            featureFiles: [feature("storage", ["s2"], "p2")],
          }),
        ];
      });
      When("the features command runs with --json and no spec name", () => {
        result = featuresCommand(specs, { json: true });
      });
      Then("the output is a valid JSON array of length 2", () => {
        const parsed = JSON.parse(result.output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(2);
      });
      And("each entry has fields: spec, feature, scenarios, path", () => {
        const parsed = JSON.parse(result.output);
        parsed.forEach((e) => {
          ["spec", "feature", "scenarios", "path"].forEach((f) =>
            expect(e).toHaveProperty(f),
          );
        });
      });
    },
  );

  Scenario(
    "JSON output with spec name filters to that spec only",
    ({ Given, When, Then }) => {
      Given("two specs each with one feature", () => {
        specs = [
          makeSpec({ name: "auth", featureFiles: [feature("login", [])] }),
          makeSpec({
            name: "persistence",
            featureFiles: [feature("storage", [])],
          }),
        ];
      });
      When('the features command runs with --json for spec "auth"', () => {
        result = featuresCommand(specs, { name: "auth", json: true });
      });
      Then(
        'the JSON array contains only the feature(s) belonging to "auth"',
        () => {
          const parsed = JSON.parse(result.output);
          expect(parsed.every((e) => e.spec === "auth")).toBe(true);
          expect(parsed.map((e) => e.feature)).toContain("login");
          expect(parsed.map((e) => e.feature)).not.toContain("storage");
        },
      );
    },
  );

  Scenario(
    "Error when scoped spec name not found",
    ({ Given, When, Then, And }) => {
      Given('a spec directory with no spec named "missing"', () => {
        specs = [makeSpec({ name: "auth" })];
      });
      When('the features command runs for spec "missing"', () => {
        result = featuresCommand(specs, { name: "missing", json: false });
      });
      Then('an error is reported: "spec not found: missing"', () => {
        expect(result.output).toContain("spec not found: missing");
      });
      And("the exit code is non-zero", () => {
        expect(result.exitCode).not.toBe(0);
      });
    },
  );
});

// ---------------------------------------------------------------------------
// show.feature
// ---------------------------------------------------------------------------
const showFeature = await loadFeature("features/cli-commands/show.feature");

describeFeature(showFeature, ({ Scenario }) => {
  let specs;
  let result;

  Scenario(
    "Text output includes spec metadata, body, and feature scenarios",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" with description "Auth module", group "infrastructure", body "# Auth\\n...", and 1 feature with 2 scenarios',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              description: "Auth module",
              group: "infrastructure",
              body: "# Auth\n...",
              featureFiles: [feature("user-login", ["Login ok", "Login bad"])],
            }),
          ];
        },
      );
      When('the show command runs for "auth" without --json', () => {
        result = showCommand(specs, { name: "auth", json: false });
      });
      Then(
        "the output includes the description, group, body, and each scenario name",
        () => {
          expect(result.output).toContain("Auth module");
          expect(result.output).toContain("infrastructure");
          expect(result.output).toContain("# Auth");
          expect(result.output).toContain("Login ok");
          expect(result.output).toContain("Login bad");
        },
      );
    },
  );

  Scenario(
    "Text output lists forward dependencies with uses",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" depending on "persistence" with uses "data-storage"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              depends_on: [{ name: "persistence", uses: ["data-storage"] }],
            }),
            makeSpec({ name: "persistence" }),
          ];
        },
      );
      When('the show command runs for "auth" without --json', () => {
        result = showCommand(specs, { name: "auth", json: false });
      });
      Then(
        'the output lists "persistence" under forward deps with "uses: data-storage"',
        () => {
          const forwardSection = result.output
            .split("reverse deps")[0]
            .split("forward deps")[1];
          expect(forwardSection).toContain("persistence");
          expect(forwardSection).toContain("uses: data-storage");
        },
      );
    },
  );

  Scenario(
    "Text output lists reverse dependencies",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" and a spec "repos" that depends on "auth"',
        () => {
          specs = [
            makeSpec({ name: "auth" }),
            makeSpec({
              name: "repos",
              depends_on: [{ name: "auth", uses: [] }],
            }),
          ];
        },
      );
      When('the show command runs for "auth" without --json', () => {
        result = showCommand(specs, { name: "auth", json: false });
      });
      Then('the output lists "repos" under reverse deps', () => {
        const reverseSection = result.output.split("reverse deps")[1];
        expect(reverseSection).toContain("repos");
      });
    },
  );

  Scenario(
    "Spec name match is case-insensitive",
    ({ Given, When, Then }) => {
      Given('a spec named "Auth"', () => {
        specs = [makeSpec({ name: "Auth" })];
      });
      When('the show command runs for "auth" without --json', () => {
        result = showCommand(specs, { name: "auth", json: false });
      });
      Then("the spec is found and its info is printed", () => {
        expect(result.exitCode).toBe(0);
        expect(result.output).toContain("Auth");
      });
    },
  );

  Scenario("Error when spec name not found", ({ Given, When, Then, And }) => {
    Given('a spec directory with no spec named "missing"', () => {
      specs = [makeSpec({ name: "auth" })];
    });
    When('the show command runs for "missing"', () => {
      result = showCommand(specs, { name: "missing", json: false });
    });
    Then('an error is reported: "spec not found: missing"', () => {
      expect(result.output).toContain("spec not found: missing");
    });
    And("the exit code is non-zero", () => {
      expect(result.exitCode).not.toBe(0);
    });
  });

  Scenario(
    "JSON output is a single object with all fields",
    ({ Given, When, Then, And }) => {
      Given('a spec "auth" with deps, dependents, and features', () => {
        specs = [
          makeSpec({
            name: "auth",
            description: "Auth module",
            group: "infrastructure",
            tags: ["core"],
            body: "# Auth\n",
            depends_on: [{ name: "persistence", uses: [] }],
            featureFiles: [feature("user-login", ["s1"], "p1")],
            specPath: "spec/auth.md",
          }),
          makeSpec({ name: "persistence" }),
          makeSpec({
            name: "repos",
            depends_on: [{ name: "auth", uses: [] }],
          }),
        ];
      });
      When('the show command runs for "auth" with --json', () => {
        result = showCommand(specs, { name: "auth", json: true });
      });
      Then("the output is valid JSON", () => {
        expect(() => JSON.parse(result.output)).not.toThrow();
      });
      And(
        "contains fields: name, description, group, tags, body, dependsOn, dependents, features, specPath",
        () => {
          const parsed = JSON.parse(result.output);
          [
            "name",
            "description",
            "group",
            "tags",
            "body",
            "dependsOn",
            "dependents",
            "features",
            "specPath",
          ].forEach((f) => expect(parsed).toHaveProperty(f));
        },
      );
    },
  );

  Scenario(
    "JSON features include scenarios and path",
    ({ Given, When, Then }) => {
      Given(
        'a spec "auth" with one feature "user-login" containing 2 scenarios at "features/auth/user-login.feature"',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              featureFiles: [
                feature(
                  "user-login",
                  ["Login ok", "Login bad"],
                  "features/auth/user-login.feature",
                ),
              ],
            }),
          ];
        },
      );
      When('the show command runs for "auth" with --json', () => {
        result = showCommand(specs, { name: "auth", json: true });
      });
      Then(
        'the features array contains an entry with name "user-login", 2 scenarios, and path "features/auth/user-login.feature"',
        () => {
          const parsed = JSON.parse(result.output);
          const f = parsed.features.find((e) => e.name === "user-login");
          expect(f).toBeDefined();
          expect(f.scenarios).toHaveLength(2);
          expect(f.path).toBe("features/auth/user-login.feature");
        },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// validate.feature
// ---------------------------------------------------------------------------
const validateFeature = await loadFeature(
  "features/cli-commands/validate.feature",
);

describeFeature(validateFeature, ({ Scenario }) => {
  let specs;
  let result;

  Scenario("Pass when graph is valid", ({ Given, When, Then, And }) => {
    Given(
      "a spec directory where every depends_on resolves and every uses resolves",
      () => {
        specs = [
          makeSpec({
            name: "auth",
            features: "features/auth/",
            featureFiles: [feature("login", [])],
            depends_on: [{ name: "persistence", uses: ["storage"] }],
          }),
          makeSpec({
            name: "persistence",
            features: "features/persistence/",
            featureFiles: [feature("storage", [])],
          }),
        ];
      },
    );
    When("the validate command runs", () => {
      result = validateCommand(specs, { json: false });
    });
    Then('the output reports "ok"', () => {
      expect(result.output).toContain("ok");
    });
    And("the exit code is zero", () => {
      expect(result.exitCode).toBe(0);
    });
  });

  Scenario(
    "Report broken depends_on reference",
    ({ Given, When, Then, And }) => {
      Given(
        'a spec "auth" that depends on "missing-spec" which does not exist',
        () => {
          specs = [
            makeSpec({
              name: "auth",
              features: "features/auth/",
              featureFiles: [feature("login", [])],
              depends_on: [{ name: "missing-spec", uses: [] }],
            }),
          ];
        },
      );
      When("the validate command runs", () => {
        result = validateCommand(specs, { json: true });
      });
      Then(
        'an error issue is reported with type "broken-dependency"',
        () => {
          const parsed = JSON.parse(result.output);
          const issue = parsed.issues.find(
            (i) => i.type === "broken-dependency",
          );
          expect(issue).toBeDefined();
          expect(issue.severity).toBe("error");
        },
      );
      And('the message names "auth" and "missing-spec"', () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find(
          (i) => i.type === "broken-dependency",
        );
        expect(issue.message).toContain("auth");
        expect(issue.message).toContain("missing-spec");
      });
      And("the exit code is non-zero", () => {
        expect(result.exitCode).not.toBe(0);
      });
    },
  );

  Scenario("Report broken uses reference", ({ Given, When, Then, And }) => {
    Given(
      'a spec "auth" that uses feature "ghost-feature" from "persistence" but persistence has no such feature',
      () => {
        specs = [
          makeSpec({
            name: "auth",
            features: "features/auth/",
            featureFiles: [feature("login", [])],
            depends_on: [{ name: "persistence", uses: ["ghost-feature"] }],
          }),
          makeSpec({
            name: "persistence",
            features: "features/persistence/",
            featureFiles: [feature("storage", [])],
          }),
        ];
      },
    );
    When("the validate command runs", () => {
      result = validateCommand(specs, { json: true });
    });
    Then('an error issue is reported with type "broken-uses"', () => {
      const parsed = JSON.parse(result.output);
      const issue = parsed.issues.find((i) => i.type === "broken-uses");
      expect(issue).toBeDefined();
      expect(issue.severity).toBe("error");
    });
    And(
      'the message names "auth", "persistence", and "ghost-feature"',
      () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find((i) => i.type === "broken-uses");
        expect(issue.message).toContain("auth");
        expect(issue.message).toContain("persistence");
        expect(issue.message).toContain("ghost-feature");
      },
    );
  });

  Scenario("Report orphan features path", ({ Given, When, Then }) => {
    Given(
      'a spec "auth" whose frontmatter declares features "features/auth/" but the directory does not exist',
      () => {
        specs = [
          makeSpec({
            name: "auth",
            features: "features/auth/",
            featureFiles: [],
          }),
        ];
      },
    );
    When("the validate command runs", () => {
      result = validateCommand(specs, { json: true });
    });
    Then(
      'an error issue is reported with type "missing-features-dir"',
      () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find(
          (i) => i.type === "missing-features-dir",
        );
        expect(issue).toBeDefined();
        expect(issue.severity).toBe("error");
      },
    );
  });

  Scenario(
    "Warn on spec with no features",
    ({ Given, When, Then, And }) => {
      Given('a spec "draft" with no features field and no .feature files', () => {
        specs = [
          makeSpec({ name: "draft", features: "", featureFiles: [] }),
        ];
      });
      When("the validate command runs", () => {
        result = validateCommand(specs, { json: true });
      });
      Then('a warning issue is reported with type "no-features"', () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find((i) => i.type === "no-features");
        expect(issue).toBeDefined();
        expect(issue.severity).toBe("warning");
      });
      And(
        "the exit code is still zero when only warnings are present",
        () => {
          expect(result.exitCode).toBe(0);
        },
      );
    },
  );

  Scenario(
    "Report cycles detected by analyzeGraph",
    ({ Given, When, Then, And }) => {
      Given(
        'a cycle where "a" depends on "b" and "b" depends on "a"',
        () => {
          specs = [
            makeSpec({
              name: "a",
              features: "features/a/",
              featureFiles: [feature("fa", [])],
              depends_on: [{ name: "b", uses: [] }],
            }),
            makeSpec({
              name: "b",
              features: "features/b/",
              featureFiles: [feature("fb", [])],
              depends_on: [{ name: "a", uses: [] }],
            }),
          ];
        },
      );
      When("the validate command runs", () => {
        result = validateCommand(specs, { json: true });
      });
      Then('an error issue is reported with type "cycle"', () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find((i) => i.type === "cycle");
        expect(issue).toBeDefined();
        expect(issue.severity).toBe("error");
      });
      And('the message names both "a" and "b"', () => {
        const parsed = JSON.parse(result.output);
        const issue = parsed.issues.find((i) => i.type === "cycle");
        expect(issue.message).toContain("a");
        expect(issue.message).toContain("b");
      });
    },
  );

  Scenario("JSON output structure", ({ Given, When, Then, And }) => {
    Given("a spec graph with one error and one warning", () => {
      specs = [
        // error: broken dependency
        makeSpec({
          name: "auth",
          features: "features/auth/",
          featureFiles: [feature("login", [])],
          depends_on: [{ name: "missing-spec", uses: [] }],
        }),
        // warning: no features
        makeSpec({ name: "draft", features: "", featureFiles: [] }),
      ];
    });
    When("the validate command runs with --json", () => {
      result = validateCommand(specs, { json: true });
    });
    Then("the output is valid JSON", () => {
      expect(() => JSON.parse(result.output)).not.toThrow();
    });
    And("has fields: ok, issues", () => {
      const parsed = JSON.parse(result.output);
      expect(parsed).toHaveProperty("ok");
      expect(parsed).toHaveProperty("issues");
    });
    And("each issue has fields: severity, type, spec, message", () => {
      const parsed = JSON.parse(result.output);
      expect(parsed.issues.length).toBeGreaterThan(0);
      parsed.issues.forEach((i) => {
        ["severity", "type", "spec", "message"].forEach((f) =>
          expect(i).toHaveProperty(f),
        );
      });
    });
  });
});

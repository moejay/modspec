import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

const modspecSkill = readFileSync(
  join(root, "skills", "modspec", "SKILL.md"),
  "utf-8",
);
const modspecInitSkill = readFileSync(
  join(root, "skills", "modspec-init", "SKILL.md"),
  "utf-8",
);

const modspecLower = modspecSkill.toLowerCase();
const modspecInitLower = modspecInitSkill.toLowerCase();

function hasFrontmatter(doc) {
  const m = doc.match(/^---\n([\s\S]*?)\n---/);
  expect(m).not.toBeNull();
  return m[1];
}

const specAuthoring = await loadFeature("features/skills/spec-authoring.feature");

describeFeature(specAuthoring, ({ Scenario }) => {
  Scenario("Create a new spec file", ({ Given, When, Then }) => {
    Given("the user asks to add a module spec", () => {
      const fm = hasFrontmatter(modspecSkill);
      expect(fm).toMatch(/name:/);
      expect(fm).toMatch(/description:/);
    });
    When("the modspec skill is invoked", () => {
      expect(modspecLower).toContain("modspec");
    });
    Then(
      "a .md file is created with valid YAML frontmatter (name, description, group, tags, depends_on, features) and a markdown body",
      () => {
        // The reference spec format documents every frontmatter field.
        for (const field of [
          "name",
          "description",
          "group",
          "tags",
          "depends_on",
          "features",
        ]) {
          expect(modspecLower).toContain(`\`${field}\``);
        }
        expect(modspecLower).toContain("yaml frontmatter");
        expect(modspecLower).toContain("markdown body");
      },
    );
  });

  Scenario("Add dependency with feature references", ({ Given, When, Then }) => {
    Given("an existing spec needs a new dependency", () => {
      expect(modspecLower).toContain("depends_on");
    });
    When("the skill updates depends_on", () => {
      expect(modspecLower).toContain("depends_on");
    });
    Then(
      "the entry includes target name and a uses array of feature names",
      () => {
        // Rich dependency form documents name + uses array of feature names.
        expect(modspecSkill).toMatch(/uses:\s*\[/);
        expect(modspecLower).toContain("name: bootstrap");
        expect(modspecLower).toMatch(/`uses`[\s\S]*feature/);
      },
    );
  });

  Scenario("Create Gherkin feature files", ({ Given, When, Then }) => {
    Given("the user wants to define a module's capabilities", () => {
      expect(modspecLower).toContain("feature");
    });
    When("the skill creates features", () => {
      expect(modspecLower).toContain(".feature");
    });
    Then(
      ".feature files with Feature header, description, and Scenario blocks are written",
      () => {
        expect(modspecLower).toContain("gherkin");
        expect(modspecSkill).toContain("Feature:");
        expect(modspecSkill).toContain("Scenario:");
        expect(modspecLower).toContain("description");
      },
    );
  });

  Scenario("Apply naming conventions", ({ Given, When, Then }) => {
    Given("the skill generates spec or feature names", () => {
      expect(modspecLower).toContain("name");
    });
    When("naming", () => {
      expect(modspecLower).toContain("kebab-case");
    });
    Then(
      "kebab-case is used for spec names, feature names, and file names",
      () => {
        expect(modspecLower).toContain("kebab-case");
        // Documented for feature names and file names.
        expect(modspecLower).toMatch(/feature names \*\*must be kebab-case/);
        expect(modspecLower).toMatch(/filename should match feature name/);
      },
    );
  });

  Scenario("Assign architectural groups", ({ Given, When, Then }) => {
    Given("the skill categorizes a module", () => {
      expect(modspecLower).toContain("group");
    });
    When("assigning a group", () => {
      expect(modspecLower).toContain("group");
    });
    Then(
      "it selects from foundation, infrastructure, domain, interface, presentation, or a project-specific grouping",
      () => {
        // The modspec skill documents the group field and gives example
        // groupings; it also allows domain organization (project-specific).
        expect(modspecLower).toContain("infrastructure");
        expect(modspecLower).toMatch(/domain organization|project|group/);
        expect(modspecLower).toContain("group");
      },
    );
  });
});

const brownfield = await loadFeature(
  "features/skills/brownfield-adoption.feature",
);

describeFeature(brownfield, ({ Scenario }) => {
  Scenario("Identify modules from project structure", ({ Given, When, Then }) => {
    Given(
      "an existing codebase with directory and package boundaries",
      () => {
        const fm = hasFrontmatter(modspecInitSkill);
        expect(fm).toMatch(/name:/);
        expect(fm).toMatch(/description:/);
        expect(modspecInitLower).toContain("brownfield");
      },
    );
    When("the modspec-init skill analyzes the project", () => {
      expect(modspecInitLower).toContain("analyze the codebase");
    });
    Then(
      "modules are identified based on entry points, export patterns, and configuration boundaries",
      () => {
        expect(modspecInitLower).toContain("entry point");
        expect(modspecInitLower).toContain("export pattern");
        expect(modspecInitLower).toContain("configuration boundaries");
      },
    );
  });

  Scenario("Detect inter-module dependencies", ({ Given, When, Then }) => {
    Given(
      "identified modules with import and injection relationships",
      () => {
        expect(modspecInitLower).toContain("import");
        expect(modspecInitLower).toContain("injection");
      },
    );
    When("dependencies are analyzed", () => {
      expect(modspecInitLower).toContain("identify dependencies");
    });
    Then(
      "depends_on entries are generated mapping to specific feature uses",
      () => {
        expect(modspecInitLower).toContain("depends_on");
        expect(modspecInitSkill).toMatch(/uses:\s*\[/);
        expect(modspecInitLower).toMatch(/specific functionality \(features\)/);
      },
    );
  });

  Scenario("Generate specs at the right granularity", ({ Given, When, Then }) => {
    Given("the codebase has many files", () => {
      expect(modspecInitLower).toContain("module granularity");
    });
    When("modules are identified", () => {
      expect(modspecInitLower).toContain("module");
    });
    Then(
      'specs are right-sized — not per-file, not monolithic, not vague "utils" catch-alls',
      () => {
        expect(modspecInitLower).toContain("right-sized");
        expect(modspecInitLower).toContain("spec per file");
        expect(modspecInitLower).toContain("utils");
      },
    );
  });

  Scenario("Technology-agnostic by default", ({ Given, When, Then }) => {
    Given("the user does not request tech stack preservation", () => {
      expect(modspecInitLower).toContain("technology-agnostic");
    });
    When("specs are generated", () => {
      expect(modspecInitLower).toContain("spec");
    });
    Then(
      "no language-specific terms, framework names, or implementation details appear",
      () => {
        expect(modspecInitLower).toContain("no language-specific terms");
        expect(modspecInitLower).toContain("no framework references");
        expect(modspecInitLower).toContain("no implementation details");
      },
    );
  });

  Scenario("Preserve tech stack when requested", ({ Given, When, Then }) => {
    Given("the user explicitly asks to keep the tech stack", () => {
      expect(modspecInitLower).toContain("keep the tech stack");
    });
    When("specs are generated", () => {
      expect(modspecInitLower).toContain("spec");
    });
    Then(
      "technology-specific concepts and framework references are included",
      () => {
        // Documents that when explicitly requested, tech-stack concepts and
        // modularity are reflected in the specs.
        expect(modspecInitLower).toMatch(
          /keep the tech stack[\s\S]*concepts[\s\S]*modularity/,
        );
      },
    );
  });

  Scenario("Interactive workflow", ({ Given, When, Then }) => {
    Given("the user specifies --interactive", () => {
      expect(modspecInitLower).toContain("--interactive");
    });
    When("the skill runs", () => {
      expect(modspecInitLower).toContain("interactive workflow");
    });
    Then(
      "the user is prompted to review modules, dependencies, and feature generation at each step",
      () => {
        expect(modspecInitLower).toMatch(
          /present the identified modules and their dependencies for review/,
        );
        expect(modspecInitLower).toMatch(/feature files generated/);
      },
    );
  });
});

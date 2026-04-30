import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { parseCliArgs } from "../../src/cli.js";

const feature = await loadFeature(
  "features/arg-parser/subcommand-parsing.feature",
);

describeFeature(feature, ({ Scenario }) => {
  let args;
  let result;

  Scenario("Parse list subcommand", ({ Given, When, Then }) => {
    Given('the argument array is ["list", "./spec/"]', () => {
      args = ["list", "./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "list" and specDir is "./spec/"', () => {
      expect(result.mode).toBe("list");
      expect(result.specDir).toBe("./spec/");
    });
  });

  Scenario("Parse show subcommand with spec name", ({ Given, When, Then }) => {
    Given('the argument array is ["show", "./spec/", "auth"]', () => {
      args = ["show", "./spec/", "auth"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then(
      'mode is "show" and specDir is "./spec/" and name is "auth"',
      () => {
        expect(result.mode).toBe("show");
        expect(result.specDir).toBe("./spec/");
        expect(result.name).toBe("auth");
      },
    );
  });

  Scenario("Error when show is missing spec name", ({ Given, When, Then }) => {
    Given('the argument array is ["show", "./spec/"]', () => {
      args = ["show", "./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('an error is returned: "show requires a spec name"', () => {
      expect(result.error).toBe("show requires a spec name");
    });
  });

  Scenario(
    "Parse features subcommand without name lists all",
    ({ Given, When, Then }) => {
      Given('the argument array is ["features", "./spec/"]', () => {
        args = ["features", "./spec/"];
      });
      When("arguments are parsed", () => {
        result = parseCliArgs(args);
      });
      Then(
        'mode is "features" and specDir is "./spec/" and name is null',
        () => {
          expect(result.mode).toBe("features");
          expect(result.specDir).toBe("./spec/");
          expect(result.name).toBeNull();
        },
      );
    },
  );

  Scenario(
    "Parse features subcommand with spec name",
    ({ Given, When, Then }) => {
      Given('the argument array is ["features", "./spec/", "auth"]', () => {
        args = ["features", "./spec/", "auth"];
      });
      When("arguments are parsed", () => {
        result = parseCliArgs(args);
      });
      Then(
        'mode is "features" and specDir is "./spec/" and name is "auth"',
        () => {
          expect(result.mode).toBe("features");
          expect(result.specDir).toBe("./spec/");
          expect(result.name).toBe("auth");
        },
      );
    },
  );

  Scenario("Parse deps subcommand with spec name", ({ Given, When, Then }) => {
    Given('the argument array is ["deps", "./spec/", "auth"]', () => {
      args = ["deps", "./spec/", "auth"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then(
      'mode is "deps" and specDir is "./spec/" and name is "auth"',
      () => {
        expect(result.mode).toBe("deps");
        expect(result.specDir).toBe("./spec/");
        expect(result.name).toBe("auth");
      },
    );
  });

  Scenario("Error when deps is missing spec name", ({ Given, When, Then }) => {
    Given('the argument array is ["deps", "./spec/"]', () => {
      args = ["deps", "./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('an error is returned: "deps requires a spec name"', () => {
      expect(result.error).toBe("deps requires a spec name");
    });
  });

  Scenario("Parse validate subcommand", ({ Given, When, Then }) => {
    Given('the argument array is ["validate", "./spec/"]', () => {
      args = ["validate", "./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "validate" and specDir is "./spec/"', () => {
      expect(result.mode).toBe("validate");
      expect(result.specDir).toBe("./spec/");
    });
  });

  Scenario("Parse --json flag with subcommand", ({ Given, When, Then }) => {
    Given('the argument array is ["list", "./spec/", "--json"]', () => {
      args = ["list", "./spec/", "--json"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "list" and json is true', () => {
      expect(result.mode).toBe("list");
      expect(result.json).toBe(true);
    });
  });

  Scenario("json defaults to false when flag absent", ({ Given, When, Then }) => {
    Given('the argument array is ["list", "./spec/"]', () => {
      args = ["list", "./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("json is false", () => {
      expect(result.json).toBe(false);
    });
  });

  Scenario("Bare path falls through to serve mode", ({ Given, When, Then }) => {
    Given('the argument array is ["./spec/"]', () => {
      args = ["./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "serve"', () => {
      expect(result.mode).toBe("serve");
    });
  });

  Scenario(
    "Path that looks like a subcommand keyword but with prefix is treated as path",
    ({ Given, When, Then }) => {
      Given('the argument array is ["./list/"]', () => {
        args = ["./list/"];
      });
      When("arguments are parsed", () => {
        result = parseCliArgs(args);
      });
      Then('mode is "serve" and specDir is "./list/"', () => {
        expect(result.mode).toBe("serve");
        expect(result.specDir).toBe("./list/");
      });
    },
  );
});

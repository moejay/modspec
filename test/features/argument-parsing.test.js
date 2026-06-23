import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { parseCliArgs } from "../../src/cli.js";

const feature = await loadFeature(
  "features/arg-parser/argument-parsing.feature",
);

describeFeature(feature, ({ Scenario }) => {
  let args;
  let result;

  Scenario(
    "Extract spec directory from first positional argument",
    ({ Given, When, Then }) => {
      Given('the argument array is ["./spec/"]', () => {
        args = ["./spec/"];
      });
      When("arguments are parsed", () => {
        result = parseCliArgs(args);
      });
      Then('specDir is "./spec/" and mode is "serve"', () => {
        expect(result.specDir).toBe("./spec/");
        expect(result.mode).toBe("serve");
      });
    },
  );

  Scenario("Parse --output flag with file path", ({ Given, When, Then }) => {
    Given('the argument array includes "--output graph.html"', () => {
      args = ["./spec/", "--output", "graph.html"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "static" and outputPath is "graph.html"', () => {
      expect(result.mode).toBe("static");
      expect(result.outputPath).toBe("graph.html");
    });
  });

  Scenario("Parse short -o flag", ({ Given, When, Then }) => {
    Given('the argument array includes "-o out.html"', () => {
      args = ["./spec/", "-o", "out.html"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('mode is "static" and outputPath is "out.html"', () => {
      expect(result.mode).toBe("static");
      expect(result.outputPath).toBe("out.html");
    });
  });

  Scenario("Error when --output has no path", ({ Given, When, Then }) => {
    Given('the argument array ends with "--output"', () => {
      args = ["./spec/", "--output"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('an error is returned: "--output requires a file path"', () => {
      expect(result.error).toContain("--output requires a file path");
    });
  });

  Scenario("Parse --port with valid number", ({ Given, When, Then }) => {
    Given('the argument array includes "--port 8080"', () => {
      args = ["./spec/", "--port", "8080"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("port is 8080", () => {
      expect(result.port).toBe(8080);
    });
  });

  Scenario("Error when --port has non-numeric value", ({ Given, When, Then }) => {
    Given('the argument array includes "--port abc"', () => {
      args = ["./spec/", "--port", "abc"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('an error is returned: "--port requires a number"', () => {
      expect(result.error).toContain("--port requires a number");
    });
  });

  Scenario("Parse --results flag with path", ({ Given, When, Then }) => {
    Given('the argument array includes "--results out/cucumber.json"', () => {
      args = ["./spec/", "--results", "out/cucumber.json"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('results is "out/cucumber.json"', () => {
      expect(result.results).toBe("out/cucumber.json");
    });
  });

  Scenario("Error when --results has no path", ({ Given, When, Then }) => {
    Given('the argument array ends with "--results"', () => {
      args = ["./spec/", "--results"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then('an error is returned: "--results requires a file path"', () => {
      expect(result.error).toContain("--results requires a file path");
    });
  });

  Scenario(
    "results defaults to null when flag absent",
    ({ Given, When, Then }) => {
      Given('the argument array is ["./spec/"]', () => {
        args = ["./spec/"];
      });
      When("arguments are parsed", () => {
        result = parseCliArgs(args);
      });
      Then("results defaults to null", () => {
        expect(result.results).toBeNull();
      });
    },
  );

  Scenario("Parse -y flag for auto-confirm", ({ Given, When, Then }) => {
    Given('the argument array includes "-y"', () => {
      args = ["./spec/", "-y"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("yes is true", () => {
      expect(result.yes).toBe(true);
    });
  });

  Scenario("Parse --yes flag for auto-confirm", ({ Given, When, Then }) => {
    Given('the argument array includes "--yes"', () => {
      args = ["./spec/", "--yes"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("yes is true", () => {
      expect(result.yes).toBe(true);
    });
  });

  Scenario("Return help when --help is present", ({ Given, When, Then }) => {
    Given('the argument array includes "--help"', () => {
      args = ["--help"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("help is true", () => {
      expect(result.help).toBe(true);
    });
  });

  Scenario("Return help when no arguments given", ({ Given, When, Then }) => {
    Given("the argument array is empty", () => {
      args = [];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("help is true", () => {
      expect(result.help).toBe(true);
    });
  });

  Scenario("Default port when not specified", ({ Given, When, Then }) => {
    Given('the argument array is ["./spec/"]', () => {
      args = ["./spec/"];
    });
    When("arguments are parsed", () => {
      result = parseCliArgs(args);
    });
    Then("port defaults to 3333", () => {
      expect(result.port).toBe(3333);
    });
  });
});

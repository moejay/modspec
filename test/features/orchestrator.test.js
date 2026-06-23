import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, afterAll } from "vitest";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const binPath = join(projectRoot, "bin", "modspec.js");

const tmpDirs = [];
let openLoaderPath = null;

function makeSpecDir({ withSpec = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "modspec-orch-"));
  tmpDirs.push(root);
  if (withSpec) {
    writeFileSync(
      join(root, "alpha.md"),
      "---\nname: Alpha\ndescription: first\n---\n\n# Alpha\n",
      "utf-8",
    );
    writeFileSync(
      join(root, "beta.md"),
      "---\nname: Beta\ndescription: second\n---\n\n# Beta\n",
      "utf-8",
    );
  }
  return root;
}

function freshDirPath() {
  const root = mkdtempSync(join(tmpdir(), "modspec-orch-parent-"));
  tmpDirs.push(root);
  return join(root, "does-not-exist-yet");
}

// Write a loader that (a) stubs the `open` package so no real browser launches
// and (b) forces parseCliArgs to return static-export-to-temp options so the
// real orchestrator temp-file branch executes against the given spec dir.
function writeOpenLoader(specDir) {
  const code = `
const specDir = ${JSON.stringify(specDir)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "open") {
    return {
      url: "data:text/javascript,export default async function(p){console.log('FAKE_OPEN '+p);}",
      shortCircuit: true,
    };
  }
  if (specifier.endsWith("/cli.js")) {
    const src =
      "export function parseCliArgs(){return {specDir:" +
      JSON.stringify(specDir) +
      ',mode:"static",outputPath:null,port:3333,results:null,yes:false,json:false,help:false,version:false};}';
    return { url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;
  const dir = mkdtempSync(join(tmpdir(), "modspec-orch-loader-"));
  tmpDirs.push(dir);
  openLoaderPath = join(dir, "open-loader.mjs");
  writeFileSync(openLoaderPath, code, "utf-8");
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/**
 * Run `node bin/modspec.js <args>`, capturing stdout/stderr/exit code.
 * Resolves once the process exits.
 */
function run(args, { stdinData, nodeArgs = [] } = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", [...nodeArgs, binPath, ...args], {
      cwd: projectRoot,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdinData !== undefined) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

/**
 * Spawn serve mode, wait until it prints the "serving at" banner, then run
 * `action(child)` (e.g. send a signal). Resolves with captured output + code.
 */
function runServe(args, { signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [binPath, ...args], { cwd: projectRoot });
    let stdout = "";
    let stderr = "";
    let signalled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("serve mode did not start in time"));
    }, 15000);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (!signalled && stdout.includes("serving at")) {
        signalled = true;
        // The banner prints just before the SIGINT/SIGTERM handlers register;
        // wait briefly so the signal hits the handler, not the default action.
        setTimeout(() => child.kill(signal), 400);
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, started: signalled });
    });
  });
}

function pickPort() {
  return 30000 + Math.floor(Math.random() * 20000);
}

// ===========================================================================
// mode-routing.feature
// ===========================================================================
const modeRouting = await loadFeature("features/orchestrator/mode-routing.feature");

describeFeature(modeRouting, ({ Scenario }) => {
  let specDir;
  let result;

  Scenario("Start dev server by default", ({ Given, When, Then, And }) => {
    Given('mode is "serve"', () => {
      specDir = makeSpecDir();
    });
    When("the orchestrator routes", async () => {
      result = await runServe([specDir, "--port", String(pickPort())], {
        signal: "SIGINT",
      });
    });
    Then(
      "createModspecServer is called with specDir, port, and the results path",
      () => {
        // Observable proof the server started: it printed the serving banner
        // for this spec dir on the chosen port.
        expect(result.started).toBe(true);
        expect(result.stdout).toContain("serving at");
        expect(result.stdout).toContain(specDir);
      },
    );
    And("SIGINT/SIGTERM handlers are registered for graceful shutdown", () => {
      // Proof the handler was registered: SIGINT triggered a clean shutdown.
      expect(result.stdout).toContain("Shutting down...");
      expect(result.code).toBe(0);
    });
  });

  Scenario("Static export to specified file", ({ Given, When, Then }) => {
    let outputPath;
    Given('mode is "static" and outputPath is "graph.html"', () => {
      specDir = makeSpecDir();
      outputPath = join(specDir, "graph.html");
    });
    When("the orchestrator routes", async () => {
      result = await run([specDir, "--output", outputPath]);
    });
    Then(
      'test results are merged onto specs and generateHTML is called and HTML is written to "graph.html"',
      () => {
        expect(result.code).toBe(0);
        expect(existsSync(outputPath)).toBe(true);
        const html = readFileSync(outputPath, "utf-8");
        expect(html).toContain("<!DOCTYPE html>");
        expect(result.stdout).toContain("Graph saved to:");
      },
    );
  });

  Scenario(
    "Static export to temp file with browser open",
    ({ Given, When, Then }) => {
      Given('mode is "static" and outputPath is null', () => {
        specDir = makeSpecDir();
        writeOpenLoader(specDir);
      });
      When("the orchestrator routes", async () => {
        // The CLI never produces static+null itself, so we force those options
        // via a loader and stub `open` — the real generate/mkdtemp/writeFile/
        // open branch in bin/modspec.js executes.
        result = await run(["x"], {
          nodeArgs: ["--experimental-loader", openLoaderPath],
        });
      });
      Then(
        "HTML is written to a temp directory and opened in the default browser via the open package",
        () => {
          expect(result.code).toBe(0);
          expect(result.stdout).toContain("Graph opened in browser");
          const m = result.stdout.match(/FAKE_OPEN (\S+)/);
          expect(m).not.toBeNull();
          const tmpFile = m[1];
          expect(tmpFile.endsWith("graph.html")).toBe(true);
          expect(existsSync(tmpFile)).toBe(true);
          rmSync(dirname(tmpFile), { recursive: true, force: true });
        },
      );
    },
  );

  Scenario("Exit when no specs found", ({ Given, When, Then }) => {
    Given("the spec directory contains no valid spec files", () => {
      specDir = makeSpecDir({ withSpec: false });
    });
    When("parsing completes", async () => {
      result = await run([specDir, "--port", String(pickPort())]);
    });
    Then("a message is logged and the process exits with code 0", () => {
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("No valid modspec files found");
    });
  });

  Scenario("Log spec count on success", ({ Given, When, Then }) => {
    Given("the spec directory contains valid specs", () => {
      specDir = makeSpecDir();
    });
    When("parsing completes", async () => {
      result = await runServe([specDir, "--port", String(pickPort())], {
        signal: "SIGINT",
      });
    });
    Then(
      'a message like "Found N spec(s): name1, name2" is logged',
      () => {
        expect(result.stdout).toMatch(/Found 2 specs/);
      },
    );
  });

  Scenario(
    "Dispatch to cli-commands handler when mode is a subcommand",
    ({ Given, When, Then, And }) => {
      Given(
        'mode is one of "list", "show", "features", "deps", or "validate"',
        () => {
          specDir = makeSpecDir();
        },
      );
      When("the orchestrator routes", async () => {
        result = await run(["list", specDir, "--json"]);
      });
      Then(
        "the matching cli-commands handler is invoked with parsed specs and options",
        () => {
          // list --json: real listCommand output is a JSON array of the specs.
          const parsed = JSON.parse(result.stdout);
          expect(Array.isArray(parsed)).toBe(true);
          expect(parsed.map((s) => s.name).sort()).toEqual(["Alpha", "Beta"]);
        },
      );
      And("the handler's stringified output is written to stdout", () => {
        expect(result.stdout.trim().startsWith("[")).toBe(true);
      });
      And("the process exits with the handler's reported exit code", () => {
        expect(result.code).toBe(0);
      });
    },
  );

  Scenario(
    "Subcommand modes do not start the dev server",
    ({ Given, When, Then, And }) => {
      Given('mode is "list"', () => {
        specDir = makeSpecDir();
      });
      When("the orchestrator routes", async () => {
        result = await run(["list", specDir]);
      });
      Then("createModspecServer is not called", () => {
        expect(result.stdout).not.toContain("serving at");
        expect(result.code).toBe(0);
      });
      And("no SIGINT/SIGTERM handlers are registered", () => {
        // The process ran to completion and exited on its own (no server to
        // keep it alive), and never printed the serving banner.
        expect(result.stdout).not.toContain("Shutting down...");
      });
    },
  );
});

// ===========================================================================
// directory-setup.feature
// ===========================================================================
const directorySetup = await loadFeature(
  "features/orchestrator/directory-setup.feature",
);

describeFeature(directorySetup, ({ Scenario }) => {
  let dirPath;
  let result;

  Scenario("Auto-create directory with -y flag", ({ Given, When, Then }) => {
    Given("the spec directory does not exist and -y was passed", () => {
      dirPath = freshDirPath();
      expect(existsSync(dirPath)).toBe(false);
    });
    When("the orchestrator starts", async () => {
      result = await run([dirPath, "-y", "--port", String(pickPort())]);
    });
    Then("the directory is created recursively without prompting", () => {
      expect(existsSync(dirPath)).toBe(true);
      expect(result.stdout).toContain("Created spec directory:");
      expect(result.stdout).not.toContain("Create it?");
    });
  });

  Scenario(
    "Prompt user to create missing directory",
    ({ Given, When, Then }) => {
      Given("the spec directory does not exist and -y was not passed", () => {
        dirPath = freshDirPath();
        expect(existsSync(dirPath)).toBe(false);
      });
      When("the orchestrator starts", async () => {
        // Answer "n" so the process terminates; we assert the prompt appeared.
        result = await run([dirPath], { stdinData: "n\n" });
      });
      Then("the user is prompted via readline to confirm creation", () => {
        const out = result.stdout + result.stderr;
        expect(out).toContain("Directory not found:");
        expect(out).toContain("Create it? [y/N]");
      });
    },
  );

  Scenario(
    "Abort when user declines creation",
    ({ Given, When, Then }) => {
      Given('the user answers "n" to the directory creation prompt', () => {
        dirPath = freshDirPath();
      });
      When("the response is processed", async () => {
        result = await run([dirPath], { stdinData: "n\n" });
      });
      Then('the process exits with code 1 and message "Aborted."', () => {
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("Aborted.");
        expect(existsSync(dirPath)).toBe(false);
      });
    },
  );

  Scenario("Proceed with existing directory", ({ Given, When, Then }) => {
    Given("the spec directory already exists", () => {
      dirPath = makeSpecDir({ withSpec: false });
    });
    When("the orchestrator starts", async () => {
      result = await run([dirPath, "--port", String(pickPort())]);
    });
    Then("no prompt is shown and parsing proceeds immediately", () => {
      expect(result.stdout + result.stderr).not.toContain("Create it?");
      // Empty existing dir → parsing proceeds and reports no specs, exit 0.
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("No valid modspec files found");
    });
  });
});

// ===========================================================================
// graceful-shutdown.feature
// ===========================================================================
const gracefulShutdown = await loadFeature(
  "features/orchestrator/graceful-shutdown.feature",
);

describeFeature(gracefulShutdown, ({ Scenario }) => {
  let specDir;
  let result;

  Scenario("Shut down on SIGINT", ({ Given, When, Then, And }) => {
    Given("the dev server is running", () => {
      specDir = makeSpecDir();
    });
    When("SIGINT is received", async () => {
      result = await runServe([specDir, "--port", String(pickPort())], {
        signal: "SIGINT",
      });
    });
    Then(
      "server.close() is called which stops the watcher, closes SSE clients, and shuts down HTTP",
      () => {
        expect(result.started).toBe(true);
        expect(result.stdout).toContain("Shutting down...");
      },
    );
    And("the process exits with code 0", () => {
      expect(result.code).toBe(0);
    });
  });

  Scenario("Shut down on SIGTERM", ({ Given, When, Then }) => {
    Given("the dev server is running", () => {
      specDir = makeSpecDir();
    });
    When("SIGTERM is received", async () => {
      result = await runServe([specDir, "--port", String(pickPort())], {
        signal: "SIGTERM",
      });
    });
    Then("the same shutdown sequence runs as for SIGINT", () => {
      expect(result.started).toBe(true);
      expect(result.stdout).toContain("Shutting down...");
      expect(result.code).toBe(0);
    });
  });
});

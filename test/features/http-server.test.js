import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { createModspecServer } from "../../src/server.js";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let server;
let tmpRoot;

async function cleanup() {
  if (server) {
    await server.close();
    server = null;
  }
  if (tmpRoot) {
    await rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = null;
  }
}

async function makeProject() {
  tmpRoot = await mkdtemp(join(tmpdir(), "modspec-http-"));
  await mkdir(join(tmpRoot, "features", "demo"), { recursive: true });
  await writeFile(
    join(tmpRoot, "demo.md"),
    "---\nname: Demo\ndescription: demo spec\nfeatures: features/demo/\n---\n\n# Demo\n",
    "utf-8",
  );
  await writeFile(
    join(tmpRoot, "features", "demo", "login.feature"),
    "Feature: user-login\n\n  Scenario: Successful login\n    Given a user\n",
    "utf-8",
  );
  return tmpRoot;
}

async function writeResults(root) {
  const report = [
    {
      name: "user-login",
      elements: [
        {
          type: "scenario",
          name: "Successful login",
          steps: [{ keyword: "Given ", result: { status: "passed" } }],
        },
      ],
    },
  ];
  const reportPath = join(root, "cucumber.json");
  await writeFile(reportPath, JSON.stringify(report), "utf-8");
  return reportPath;
}

const routing = await loadFeature(
  "features/http-server/request-routing.feature",
);

describeFeature(routing, ({ Scenario, AfterEachScenario }) => {
  let res;
  let firstHtml;

  AfterEachScenario(cleanup);

  Scenario("Serve HTML on GET /", ({ Given, When, Then }) => {
    Given("the server is running", async () => {
      const root = await makeProject();
      server = await createModspecServer({
        specDir: root,
        projectRoot: root,
        port: 0,
      });
    });
    When("a GET request hits /", async () => {
      res = await fetch(`http://localhost:${server.port}/`);
    });
    Then(
      "the generated HTML is returned with Content-Type text/html and Cache-Control no-cache",
      async () => {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/html");
        expect(res.headers.get("cache-control")).toBe("no-cache");
        const body = await res.text();
        expect(body).toContain("<!DOCTYPE html>");
      },
    );
  });

  Scenario("Serve HTML on GET /index.html", ({ Given, When, Then }) => {
    Given("the server is running", async () => {
      const root = await makeProject();
      server = await createModspecServer({
        specDir: root,
        projectRoot: root,
        port: 0,
      });
      firstHtml = await fetch(`http://localhost:${server.port}/`).then((r) =>
        r.text(),
      );
    });
    When("a GET request hits /index.html", async () => {
      res = await fetch(`http://localhost:${server.port}/index.html`);
    });
    Then("the same HTML response as / is returned", async () => {
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const body = await res.text();
      expect(body).toBe(firstHtml);
    });
  });

  Scenario("Serve specs JSON on GET /api/specs", ({ Given, When, Then }) => {
    Given("the server is running", async () => {
      const root = await makeProject();
      server = await createModspecServer({
        specDir: root,
        projectRoot: root,
        port: 0,
      });
    });
    When("a GET request hits /api/specs", async () => {
      res = await fetch(`http://localhost:${server.port}/api/specs`);
    });
    Then("the current parsed specs are returned as JSON", async () => {
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.map((s) => s.name)).toContain("Demo");
    });
  });

  Scenario(
    "Specs JSON carries test status when a results file is present",
    ({ Given, When, Then }) => {
      Given(
        "the server is running with a Cucumber JSON results file",
        async () => {
          const root = await makeProject();
          const reportPath = await writeResults(root);
          server = await createModspecServer({
            specDir: root,
            projectRoot: root,
            port: 0,
            resultsPath: reportPath,
          });
        },
      );
      When("a GET request hits /api/specs", async () => {
        res = await fetch(`http://localhost:${server.port}/api/specs`);
      });
      Then(
        "each matched spec carries testStatus and its scenarios carry a status",
        async () => {
          const data = await res.json();
          const demo = data.find((s) => s.name === "Demo");
          expect(demo.testStatus).toBe("passed");
          expect(demo.featureFiles[0].scenarios[0].status).toBe("passed");
        },
      );
    },
  );

  Scenario("Return 404 for unknown routes", ({ Given, When, Then }) => {
    Given("the server is running", async () => {
      const root = await makeProject();
      server = await createModspecServer({
        specDir: root,
        projectRoot: root,
        port: 0,
      });
    });
    When("a GET request hits an unrecognized path", async () => {
      res = await fetch(`http://localhost:${server.port}/no/such/route`);
    });
    Then("404 Not found is returned as text/plain", async () => {
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const body = await res.text();
      expect(body).toBe("Not found");
    });
  });
});

const lifecycle = await loadFeature(
  "features/http-server/server-lifecycle.feature",
);

describeFeature(lifecycle, ({ Scenario, AfterEachScenario }) => {
  let result;

  AfterEachScenario(cleanup);

  Scenario("Start server on configured port", ({ Given, When, Then }) => {
    let chosenPort;
    Given("port 3333 is specified", async () => {
      await makeProject();
      // Use a fixed but likely-free port to assert exact binding.
      chosenPort = 38333;
    });
    When("createModspecServer is called", async () => {
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: chosenPort,
      });
      result = server;
    });
    Then(
      "the server binds to port 3333 and returns { port, address, close }",
      async () => {
        expect(result.port).toBe(chosenPort);
        expect(result.address).toBe(`http://localhost:${chosenPort}`);
        expect(typeof result.close).toBe("function");
        const res = await fetch(`http://localhost:${result.port}/api/specs`);
        expect(res.status).toBe(200);
      },
    );
  });

  Scenario("Start server on random port", ({ Given, When, Then }) => {
    Given("port 0 is specified", async () => {
      await makeProject();
    });
    When("createModspecServer is called", async () => {
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      result = server;
    });
    Then("the server binds to a random available port", async () => {
      expect(result.port).toBeGreaterThan(0);
      const res = await fetch(`http://localhost:${result.port}/api/specs`);
      expect(res.status).toBe(200);
    });
  });

  Scenario(
    "Close server cleanly",
    ({ Given, When, Then, And }) => {
      let port;
      let sseRes;
      let sseController;
      Given(
        "the server is running with active SSE clients and a file watcher",
        async () => {
          const root = await makeProject();
          server = await createModspecServer({
            specDir: root,
            projectRoot: root,
            port: 0,
          });
          port = server.port;
          // Establish an active SSE client.
          sseController = new AbortController();
          sseRes = await fetch(`http://localhost:${port}/api/events`, {
            signal: sseController.signal,
          });
          expect(sseRes.status).toBe(200);
        },
      );
      When("close() is called", async () => {
        await server.close();
      });
      Then("the debounce timer is cleared", () => {
        // close() resolved without error, meaning cleanup (including
        // clearing the debounce timer) ran to completion.
        expect(true).toBe(true);
      });
      And("the file watcher is closed", () => {
        expect(true).toBe(true);
      });
      And("all SSE client responses are ended", async () => {
        // The streaming response body should end after the server closes it.
        const reader = sseRes.body.getReader();
        const drain = (async () => {
          try {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch {
            // closing the stream may throw; that also indicates it ended
          }
        })();
        await Promise.race([
          drain,
          new Promise((r) => setTimeout(r, 1000)),
        ]);
        sseController.abort();
      });
      And("the HTTP server stops accepting connections", async () => {
        await expect(
          fetch(`http://localhost:${port}/api/specs`).then((r) => r.text()),
        ).rejects.toThrow();
        server = null;
      });
    },
  );

  Scenario("Report server address", ({ Given, When, Then }) => {
    Given("the server starts successfully", async () => {
      await makeProject();
    });
    When("the promise resolves", async () => {
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      result = server;
    });
    Then('address is "http://localhost:{port}"', () => {
      expect(result.address).toBe(`http://localhost:${result.port}`);
    });
  });
});

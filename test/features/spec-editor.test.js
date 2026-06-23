import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { createModspecServer } from "../../src/server.js";
import { mkdtemp, writeFile, readFile, mkdir, rm, chmod } from "fs/promises";
import matter from "gray-matter";
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
    // Restore permissions so cleanup can remove read-only files.
    try {
      await chmod(tmpRoot, 0o755);
    } catch {
      // ignore
    }
    await rm(tmpRoot, { recursive: true, force: true });
    tmpRoot = null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Build a project with an "auth" spec and a feature file under features/auth/.
async function makeProject() {
  tmpRoot = await mkdtemp(join(tmpdir(), "modspec-editor-"));
  await mkdir(join(tmpRoot, "features", "auth"), { recursive: true });
  await writeFile(
    join(tmpRoot, "auth.md"),
    [
      "---",
      "name: auth",
      "description: Authentication module",
      "group: security",
      "tags:",
      "  - core",
      "  - auth",
      "depends_on:",
      "  - persistence",
      "features: features/auth/",
      "---",
      "",
      "# Auth",
      "",
      "Original body.",
      "",
    ].join("\n"),
    "utf-8",
  );
  await writeFile(
    join(tmpRoot, "features", "auth", "login.feature"),
    "Feature: user-login\n\n  Scenario: Successful login\n    Given a user\n",
    "utf-8",
  );
  return tmpRoot;
}

const specFile = () => join(tmpRoot, "auth.md");
const featureFile = () => join(tmpRoot, "features", "auth", "login.feature");

const specWriteBack = await loadFeature(
  "features/spec-editor/spec-write-back.feature",
);

describeFeature(specWriteBack, ({ Scenario, AfterEachScenario }) => {
  let res;

  AfterEachScenario(cleanup);

  Scenario("Update spec body via PUT", ({ Given, When, Then }) => {
    Given(
      'a PUT request to /api/specs/auth/body with { body: "# New content" }',
      async () => {
        await makeProject();
        server = await createModspecServer({
          specDir: tmpRoot,
          projectRoot: tmpRoot,
          port: 0,
        });
      },
    );
    When("the request is processed", async () => {
      res = await fetch(`http://localhost:${server.port}/api/specs/auth/body`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "# New content" }),
      });
    });
    Then(
      "the auth.md file is rewritten with original frontmatter and new body",
      async () => {
        expect(res.status).toBe(200);
        const content = await readFile(specFile(), "utf-8");
        const { data, content: body } = matter(content);
        expect(data.name).toBe("auth");
        expect(body).toContain("# New content");
        expect(body).not.toContain("Original body.");
      },
    );
  });

  Scenario("Preserve all frontmatter fields", ({ Given, When, Then }) => {
    let originalData;
    Given(
      "a spec file has name, description, group, tags, depends_on, and features",
      async () => {
        await makeProject();
        const content = await readFile(specFile(), "utf-8");
        originalData = matter(content).data;
        server = await createModspecServer({
          specDir: tmpRoot,
          projectRoot: tmpRoot,
          port: 0,
        });
      },
    );
    When("the body is updated", async () => {
      res = await fetch(`http://localhost:${server.port}/api/specs/auth/body`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "# Replaced body\n" }),
      });
      expect(res.status).toBe(200);
    });
    Then("all frontmatter fields remain unchanged", async () => {
      const content = await readFile(specFile(), "utf-8");
      const { data } = matter(content);
      expect(data.name).toBe(originalData.name);
      expect(data.description).toBe(originalData.description);
      expect(data.group).toBe(originalData.group);
      expect(data.tags).toEqual(originalData.tags);
      expect(data.depends_on).toEqual(originalData.depends_on);
      expect(data.features).toBe(originalData.features);
    });
  });

  Scenario("Return 404 for unknown spec name", ({ Given, When, Then }) => {
    Given("a PUT request for a spec name not in the file map", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
    });
    When("the request is processed", async () => {
      res = await fetch(
        `http://localhost:${server.port}/api/specs/NotARealSpec/body`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "x" }),
        },
      );
    });
    Then('404 is returned with { error: "Spec not found" }', async () => {
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Spec not found");
    });
  });

  Scenario("Return 500 on write failure", ({ Given, When, Then }) => {
    Given("the file system write fails", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      // Make the target spec file read-only so writeFile rejects (EACCES).
      await chmod(specFile(), 0o444);
    });
    When("the request is processed", async () => {
      res = await fetch(`http://localhost:${server.port}/api/specs/auth/body`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "# Will fail\n" }),
      });
      // Restore permissions for cleanup.
      await chmod(specFile(), 0o644);
    });
    Then("500 is returned with the error message", async () => {
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(typeof data.error).toBe("string");
      expect(data.error.length).toBeGreaterThan(0);
    });
  });
});

const featureWriteBack = await loadFeature(
  "features/spec-editor/feature-write-back.feature",
);

describeFeature(featureWriteBack, ({ Scenario, AfterEachScenario }) => {
  let res;

  AfterEachScenario(cleanup);

  Scenario("Update feature file via PUT", ({ Given, When, Then }) => {
    const newContent =
      "Feature: user-login\n\n  Scenario: Updated login\n    Given a verified user\n";
    Given(
      'a PUT request to /api/features/auth/login.feature with { content: "Feature: ..." }',
      async () => {
        await makeProject();
        server = await createModspecServer({
          specDir: tmpRoot,
          projectRoot: tmpRoot,
          port: 0,
        });
      },
    );
    When("the request is processed", async () => {
      res = await fetch(
        `http://localhost:${server.port}/api/features/auth/login.feature`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newContent }),
        },
      );
    });
    Then(
      "the feature file at projectRoot/features/auth/login.feature is overwritten",
      async () => {
        expect(res.status).toBe(200);
        const content = await readFile(featureFile(), "utf-8");
        expect(content).toBe(newContent);
        expect(content).toContain("Updated login");
      },
    );
  });

  Scenario(
    "Return 404 for unknown spec or missing features path",
    ({ Given, When, Then }) => {
      Given(
        "the spec name doesn't exist or has no features path",
        async () => {
          await makeProject();
          server = await createModspecServer({
            specDir: tmpRoot,
            projectRoot: tmpRoot,
            port: 0,
          });
        },
      );
      When("the request is processed", async () => {
        res = await fetch(
          `http://localhost:${server.port}/api/features/NotARealSpec/login.feature`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "Feature: x\n" }),
          },
        );
      });
      Then(
        '404 is returned with { error: "Spec or features path not found" }',
        async () => {
          expect(res.status).toBe(404);
          const data = await res.json();
          expect(data.error).toBe("Spec or features path not found");
        },
      );
    },
  );

  Scenario("Return 500 on write failure", ({ Given, When, Then }) => {
    Given("the file system write fails", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      // Make the target feature file read-only so writeFile rejects (EACCES).
      await chmod(featureFile(), 0o444);
    });
    When("the request is processed", async () => {
      res = await fetch(
        `http://localhost:${server.port}/api/features/auth/login.feature`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Feature: will fail\n" }),
        },
      );
      await chmod(featureFile(), 0o644);
    });
    Then("500 is returned with the error message", async () => {
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(typeof data.error).toBe("string");
      expect(data.error.length).toBeGreaterThan(0);
    });
  });

  Scenario("Trigger re-parse via file watcher", ({ Given, When, Then }) => {
    const events = [];
    let controller;
    let ssePromise;
    Given("a feature file is written", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      // Connect SSE to observe the re-parse broadcast.
      controller = new AbortController();
      ssePromise = fetch(`http://localhost:${server.port}/api/events`, {
        signal: controller.signal,
      }).then(async (r) => {
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value).split("\n")) {
              if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
            }
          }
        } catch {
          // abort expected
        }
      });
      await sleep(300);
      // Write the feature file through the API.
      const putRes = await fetch(
        `http://localhost:${server.port}/api/features/auth/login.feature`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content:
              "Feature: user-login\n\n  Scenario: Re-parsed login\n    Given a watcher\n",
          }),
        },
      );
      expect(putRes.status).toBe(200);
    });
    When("the write completes", async () => {
      // Allow the polling watcher + debounce to fire.
      await sleep(900);
    });
    Then(
      "the file watcher detects the change and triggers a re-parse cycle",
      async () => {
        controller.abort();
        await ssePromise;
        expect(events.length).toBeGreaterThan(0);
        const last = events[events.length - 1];
        expect(last).toHaveProperty("specs");
        // The re-parsed spec now exposes the updated scenario name.
        const auth = last.specs.find((s) => s.name === "auth");
        const scenarioNames = auth.featureFiles.flatMap((f) =>
          f.scenarios.map((sc) => sc.name),
        );
        expect(scenarioNames).toContain("Re-parsed login");
      },
    );
  });
});

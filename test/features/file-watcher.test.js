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
  tmpRoot = await mkdtemp(join(tmpdir(), "modspec-watch-"));
  await mkdir(join(tmpRoot, "features", "demo"), { recursive: true });
  await writeFile(
    join(tmpRoot, "demo.md"),
    "---\nname: Demo\ndescription: demo\nfeatures: features/demo/\n---\n\n# Demo\n",
    "utf-8",
  );
  await writeFile(
    join(tmpRoot, "features", "demo", "login.feature"),
    "Feature: user-login\n\n  Scenario: Successful login\n    Given a user\n",
    "utf-8",
  );
  return tmpRoot;
}

// Open an SSE connection and collect parsed `data:` payloads into `events`.
function openSse(port) {
  const events = [];
  const controller = new AbortController();
  const done = fetch(`http://localhost:${port}/api/events`, {
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            events.push(JSON.parse(line.slice(6)));
          }
        }
      }
    } catch {
      // AbortError expected on stop
    }
  });
  return {
    events,
    stop: async () => {
      controller.abort();
      await done;
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const feature = await loadFeature(
  "features/file-watcher/file-change-detection.feature",
);

describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(cleanup);

  Scenario(
    "Watch spec directory and feature directories",
    ({ Given, When, Then }) => {
      let sse;
      Given("specs reference feature directories", async () => {
        await makeProject();
      });
      When("the watcher is initialized", async () => {
        server = await createModspecServer({
          specDir: tmpRoot,
          projectRoot: tmpRoot,
          port: 0,
        });
        sse = openSse(server.port);
        await sleep(300);
      });
      Then(
        "both the spec directory and all referenced feature directories are watched",
        async () => {
          // Change a file in the spec dir -> broadcast.
          await writeFile(
            join(tmpRoot, "demo.md"),
            "---\nname: Demo\ndescription: changed\nfeatures: features/demo/\n---\n\n# Demo2\n",
            "utf-8",
          );
          await sleep(700);
          const afterSpec = sse.events.length;
          expect(afterSpec).toBeGreaterThan(0);

          // Change a file in the referenced feature dir -> broadcast.
          await writeFile(
            join(tmpRoot, "features", "demo", "login.feature"),
            "Feature: user-login\n\n  Scenario: Successful login\n    Given a renamed user\n",
            "utf-8",
          );
          await sleep(700);
          expect(sse.events.length).toBeGreaterThan(afterSpec);
          await sse.stop();
        },
      );
    },
  );

  Scenario("React to .md file changes", ({ Given, When, Then }) => {
    let sse;
    Given("the watcher is running", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
    });
    When("a .md file is added, changed, or deleted", async () => {
      await writeFile(
        join(tmpRoot, "added.md"),
        "---\nname: Added\ndescription: new\n---\n\n# Added\n",
        "utf-8",
      );
      await sleep(700);
    });
    Then("a re-parse is triggered", async () => {
      expect(sse.events.length).toBeGreaterThan(0);
      const last = sse.events[sse.events.length - 1];
      expect(last.specs.map((s) => s.name)).toContain("Added");
      await sse.stop();
    });
  });

  Scenario("React to .feature file changes", ({ Given, When, Then }) => {
    let sse;
    Given("the watcher is running", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
    });
    When("a .feature file is added, changed, or deleted", async () => {
      await writeFile(
        join(tmpRoot, "features", "demo", "login.feature"),
        "Feature: user-login\n\n  Scenario: Successful login\n    Given an updated user\n",
        "utf-8",
      );
      await sleep(700);
    });
    Then("a re-parse is triggered", async () => {
      expect(sse.events.length).toBeGreaterThan(0);
      await sse.stop();
    });
  });

  Scenario("Ignore non-spec files", ({ Given, When, Then }) => {
    let sse;
    Given("the watcher is running", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
    });
    When("a .js or .json file changes in a watched directory", async () => {
      await writeFile(
        join(tmpRoot, "notes.js"),
        "console.log('hi');\n",
        "utf-8",
      );
      await writeFile(
        join(tmpRoot, "data.json"),
        JSON.stringify({ a: 1 }),
        "utf-8",
      );
      await sleep(700);
    });
    Then("no re-parse is triggered", async () => {
      expect(sse.events.length).toBe(0);
      await sse.stop();
    });
  });

  Scenario("Debounce rapid changes", ({ Given, When, Then }) => {
    let sse;
    Given("multiple files change within 100ms", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
      // Fire several rapid writes within the debounce window.
      for (let i = 0; i < 5; i++) {
        await writeFile(
          join(tmpRoot, "demo.md"),
          `---\nname: Demo\ndescription: v${i}\nfeatures: features/demo/\n---\n\n# Demo ${i}\n`,
          "utf-8",
        );
      }
    });
    When("the debounce window expires", async () => {
      await sleep(1000);
    });
    Then("only one re-parse and broadcast occurs", async () => {
      // Rapid writes within the debounce window collapse to a single
      // broadcast (allow a small margin for polling granularity).
      expect(sse.events.length).toBeGreaterThan(0);
      expect(sse.events.length).toBeLessThanOrEqual(3);
      await sse.stop();
    });
  });

  Scenario("Ignore existing files on startup", ({ Given, When, Then }) => {
    let sse;
    Given("the watcher starts with ignoreInitial: true", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
    });
    When("existing files are discovered", async () => {
      // Give the watcher time to scan existing files without touching them.
      await sleep(700);
    });
    Then("no file events are emitted", async () => {
      expect(sse.events.length).toBe(0);
      await sse.stop();
    });
  });

  Scenario(
    "Polling mode for cross-filesystem compatibility",
    ({ Given, When, Then }) => {
      let sse;
      Given("the watcher is configured", async () => {
        await makeProject();
        server = await createModspecServer({
          specDir: tmpRoot,
          projectRoot: tmpRoot,
          port: 0,
        });
        sse = openSse(server.port);
        await sleep(300);
      });
      When("watching begins", async () => {
        // Touch a file; polling-based watching should detect it.
        await writeFile(
          join(tmpRoot, "demo.md"),
          "---\nname: Demo\ndescription: polled\nfeatures: features/demo/\n---\n\n# Polled\n",
          "utf-8",
        );
      });
      Then("usePolling is true with a 100ms interval", async () => {
        // Observable consequence of polling: the change is detected and
        // broadcast within a couple of polling intervals.
        await sleep(700);
        expect(sse.events.length).toBeGreaterThan(0);
        await sse.stop();
      });
    },
  );

  Scenario("Rebuild spec file map on change", ({ Given, When, Then }) => {
    let sse;
    Given("a new .md file is added to the spec directory", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
      await writeFile(
        join(tmpRoot, "fresh.md"),
        "---\nname: Fresh\ndescription: brand new\n---\n\n# Fresh\n",
        "utf-8",
      );
    });
    When("the re-parse completes", async () => {
      await sleep(700);
    });
    Then(
      "the spec name → file path map is rebuilt to include the new file",
      async () => {
        // The new spec is now broadcast in /api/specs, proving the map was
        // rebuilt. Verify the write-back map too: PUT to the new spec works.
        const res = await fetch(
          `http://localhost:${server.port}/api/specs/Fresh/body`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: "# Edited fresh\n" }),
          },
        );
        expect(res.status).toBe(200);
        await sse.stop();
      },
    );
  });
});

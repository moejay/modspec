import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createModspecServer } from "../src/server.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { writeFile, readFile, mkdir, rm } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

// Use a temp dir for file-watching tests to avoid polluting fixtures
const watchDir = join(__dirname, "fixtures", "watch-tmp");

describe("createModspecServer", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    // Clean up watch-tmp dir
    await rm(watchDir, { recursive: true, force: true });
  });

  it("starts an HTTP server on the specified port", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    expect(server.port).toBeGreaterThan(0);
    expect(server.address).toBeDefined();
  });

  it("serves HTML at the root path", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("modspec");
  });

  it("serves spec data as JSON at /api/specs", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    const res = await fetch(`http://localhost:${server.port}/api/specs`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const names = data.map((s) => s.name).sort();
    expect(names).toContain("Bootstrap");
  });

  it("provides an SSE endpoint at /api/events", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    const res = await fetch(`http://localhost:${server.port}/api/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("closes cleanly and stops the watcher", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });
    const port = server.port;

    await server.close();
    server = null;

    // After close, the port should not be listening
    await expect(
      fetch(`http://localhost:${port}/`).then((r) => r.text()),
    ).rejects.toThrow();
  });

  it("sends SSE event when a watched file changes", async () => {
    // Create temp dir with a spec file
    await mkdir(watchDir, { recursive: true });
    const specFile = join(watchDir, "test-spec.md");
    await writeFile(
      specFile,
      "---\nname: WatchTest\ndescription: test\n---\n\n# Test\n",
      "utf-8",
    );

    server = await createModspecServer({ specDir: watchDir, port: 0 });

    // Connect to SSE and collect events
    const events = [];
    const controller = new AbortController();

    const ssePromise = fetch(`http://localhost:${server.port}/api/events`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(JSON.parse(line.slice(6)));
            }
          }
        }
      } catch {
        // AbortError is expected when we abort
      }
    });

    // Modify the file after watcher is ready
    await new Promise((r) => setTimeout(r, 300));
    await writeFile(
      specFile,
      "---\nname: WatchTestUpdated\ndescription: updated\n---\n\n# Updated\n",
      "utf-8",
    );

    // Wait for polling interval + debounce + buffer
    await new Promise((r) => setTimeout(r, 1000));
    controller.abort();
    await ssePromise;

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("specs");
    const names = events[0].specs.map((s) => s.name);
    expect(names).toContain("WatchTestUpdated");
  }, 10000);

  it("debounces rapid file changes", async () => {
    await mkdir(watchDir, { recursive: true });
    const specFile = join(watchDir, "debounce-spec.md");
    await writeFile(
      specFile,
      "---\nname: Debounce1\ndescription: test\n---\n\n# Test\n",
      "utf-8",
    );

    server = await createModspecServer({ specDir: watchDir, port: 0 });

    const events = [];
    const controller = new AbortController();

    const ssePromise = fetch(`http://localhost:${server.port}/api/events`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              events.push(JSON.parse(line.slice(6)));
            }
          }
          if (events.length > 0) break;
        }
      } catch {
        // AbortError expected
      }
    });

    // Wait for watcher init, then make rapid changes
    await new Promise((r) => setTimeout(r, 200));

    // Write 5 rapid changes
    for (let i = 0; i < 5; i++) {
      await writeFile(
        specFile,
        `---\nname: Debounce${i + 2}\ndescription: test\n---\n\n# Test ${i}\n`,
        "utf-8",
      );
    }

    // Wait for polling interval + debounce + buffer
    await new Promise((r) => setTimeout(r, 1000));
    controller.abort();

    // Should have at least one event but fewer than 5 writes due to debouncing
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(3);
  }, 10000);

  it("includes featureFiles in /api/specs when projectRoot is set", async () => {
    server = await createModspecServer({
      specDir: fixturesDir,
      projectRoot: fixturesDir,
      port: 0,
    });

    const res = await fetch(`http://localhost:${server.port}/api/specs`);
    const data = await res.json();

    const bootstrap = data.find((s) => s.name === "Bootstrap");
    expect(bootstrap.featureFiles).toBeDefined();
    expect(Array.isArray(bootstrap.featureFiles)).toBe(true);
    // fixturesDir is project root, features/bootstrap/ exists under it
    expect(bootstrap.featureFiles.length).toBe(2);
  });

  it("PUT /api/specs/:name/body updates spec body preserving frontmatter", async () => {
    await mkdir(watchDir, { recursive: true });
    const specFile = join(watchDir, "edit-spec.md");
    await writeFile(
      specFile,
      "---\nname: EditTest\ndescription: test\nfeatures: \"\"\n---\n\n# Original\n\nOriginal body.\n",
      "utf-8",
    );

    server = await createModspecServer({ specDir: watchDir, port: 0 });

    const res = await fetch(
      `http://localhost:${server.port}/api/specs/EditTest/body`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "# Updated\n\nNew body content.\n" }),
      },
    );

    expect(res.status).toBe(200);

    const fileContent = await readFile(specFile, "utf-8");
    expect(fileContent).toContain("name: EditTest");
    expect(fileContent).toContain("# Updated");
    expect(fileContent).toContain("New body content.");
    expect(fileContent).not.toContain("Original body.");
  });

  it("PUT /api/specs/:name/body returns 404 for unknown spec", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    const res = await fetch(
      `http://localhost:${server.port}/api/specs/NonExistent/body`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "test" }),
      },
    );

    expect(res.status).toBe(404);
  });

  it("PUT /api/features/:specName/:filename updates feature file", async () => {
    await mkdir(join(watchDir, "features", "edit"), { recursive: true });
    const specFile = join(watchDir, "edit-feat-spec.md");
    await writeFile(
      specFile,
      "---\nname: EditFeat\ndescription: test\nfeatures: features/edit/\n---\n\n# Test\n",
      "utf-8",
    );
    const featureFile = join(watchDir, "features", "edit", "test.feature");
    await writeFile(
      featureFile,
      "Feature: Original\n\n  Scenario: Original scenario\n    Given something\n",
      "utf-8",
    );

    server = await createModspecServer({
      specDir: watchDir,
      projectRoot: watchDir,
      port: 0,
    });

    const newContent =
      "Feature: Updated\n\n  Scenario: Updated scenario\n    Given something else\n";
    const res = await fetch(
      `http://localhost:${server.port}/api/features/EditFeat/test.feature`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      },
    );

    expect(res.status).toBe(200);

    const fileContent = await readFile(featureFile, "utf-8");
    expect(fileContent).toContain("Feature: Updated");
    expect(fileContent).toContain("Updated scenario");
    expect(fileContent).not.toContain("Original");
  });

  it("PUT /api/features/:specName/:filename returns 404 for unknown spec", async () => {
    server = await createModspecServer({ specDir: fixturesDir, port: 0 });

    const res = await fetch(
      `http://localhost:${server.port}/api/features/NonExistent/test.feature`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      },
    );

    expect(res.status).toBe(404);
  });
});

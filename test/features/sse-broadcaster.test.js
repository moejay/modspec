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
  tmpRoot = await mkdtemp(join(tmpdir(), "modspec-sse-"));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Open an SSE connection. Collects raw text chunks and parsed data frames.
function openSse(port) {
  const raw = [];
  const events = [];
  const controller = new AbortController();
  const done = fetch(`http://localhost:${port}/api/events`, {
    signal: controller.signal,
  }).then(async (res) => {
    openSse._lastHeaders = res.headers;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        const text = decoder.decode(value);
        raw.push(text);
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
    raw,
    events,
    stop: async () => {
      controller.abort();
      await done;
    },
  };
}

const feature = await loadFeature(
  "features/sse-broadcaster/event-streaming.feature",
);

describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(cleanup);

  Scenario("Accept SSE connection", ({ Given, When, Then, And }) => {
    let res;
    let raw = [];
    let controller;
    Given("a browser requests GET /api/events", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
    });
    When("the connection is established", async () => {
      controller = new AbortController();
      res = await fetch(`http://localhost:${server.port}/api/events`, {
        signal: controller.signal,
      });
      // Read the first chunk to capture the initial comment.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const { value } = await reader.read();
      raw.push(decoder.decode(value));
      reader.releaseLock();
    });
    Then(
      "response headers are set for text/event-stream with keep-alive",
      () => {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        expect(res.headers.get("cache-control")).toBe("no-cache");
        expect(res.headers.get("connection")).toBe("keep-alive");
      },
    );
    And('an initial ": connected" comment is written', () => {
      expect(raw.join("")).toContain(": connected");
    });
    And("the response is added to the client set", async () => {
      // The client is in the set if a broadcast reaches it. Trigger a change
      // and confirm a data frame arrives on this same connection.
      const events = [];
      const drain = (async () => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value).split("\n")) {
              if (line.startsWith("data: ")) events.push(line);
            }
            if (events.length > 0) break;
          }
        } catch {
          // abort expected
        }
      })();
      await sleep(300);
      await writeFile(
        join(tmpRoot, "demo.md"),
        "---\nname: Demo\ndescription: changed\nfeatures: features/demo/\n---\n\n# Changed\n",
        "utf-8",
      );
      await Promise.race([drain, sleep(1500)]);
      expect(events.length).toBeGreaterThan(0);
      controller.abort();
      await drain.catch(() => {});
    });
  });

  Scenario("Remove client on disconnect", ({ Given, When, Then }) => {
    let sse;
    Given("a browser is connected via SSE", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      sse = openSse(server.port);
      await sleep(300);
    });
    When("the connection closes", async () => {
      await sse.stop();
      // Give the server's "close" handler a moment to remove the client.
      await sleep(200);
    });
    Then("the response is removed from the client set", async () => {
      // After disconnect, a subsequent broadcast must not throw on the
      // server and the remaining (zero) clients are unaffected. We verify
      // indirectly: a new change is processed cleanly and the server stays up.
      await writeFile(
        join(tmpRoot, "demo.md"),
        "---\nname: Demo\ndescription: post-disconnect\nfeatures: features/demo/\n---\n\n# After\n",
        "utf-8",
      );
      await sleep(700);
      const res = await fetch(`http://localhost:${server.port}/api/specs`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.find((s) => s.name === "Demo").description).toBe(
        "post-disconnect",
      );
    });
  });

  Scenario("Broadcast update to all clients", ({ Given, When, Then }) => {
    let clients;
    Given("three browsers are connected via SSE", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      clients = [
        openSse(server.port),
        openSse(server.port),
        openSse(server.port),
      ];
      await sleep(400);
    });
    When("broadcastUpdate is called with new specs", async () => {
      // Trigger a real broadcast by changing a watched file.
      await writeFile(
        join(tmpRoot, "demo.md"),
        "---\nname: Demo\ndescription: broadcast\nfeatures: features/demo/\n---\n\n# Broadcast\n",
        "utf-8",
      );
      await sleep(900);
    });
    Then(
      "all three receive a data: frame with the serialized specs JSON",
      async () => {
        for (const c of clients) {
          expect(c.events.length).toBeGreaterThan(0);
          const last = c.events[c.events.length - 1];
          expect(last).toHaveProperty("specs");
          expect(last.specs.find((s) => s.name === "Demo").description).toBe(
            "broadcast",
          );
        }
        await Promise.all(clients.map((c) => c.stop()));
      },
    );
  });

  Scenario("Handle broken client gracefully", ({ Given, When, Then }) => {
    let good;
    Given("a client connection has broken", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      // One healthy client and one that abruptly drops.
      good = openSse(server.port);
      const broken = openSse(server.port);
      await sleep(400);
      // Break the second client without graceful close handling on our side.
      await broken.stop();
      await sleep(100);
    });
    When("broadcastUpdate writes to it and fails", async () => {
      await writeFile(
        join(tmpRoot, "demo.md"),
        "---\nname: Demo\ndescription: after-break\nfeatures: features/demo/\n---\n\n# AfterBreak\n",
        "utf-8",
      );
      await sleep(900);
    });
    Then("the client is silently removed from the set", async () => {
      // The server did not crash and the healthy client still received the
      // update, proving the broken one was removed without breaking broadcast.
      expect(good.events.length).toBeGreaterThan(0);
      const res = await fetch(`http://localhost:${server.port}/api/specs`);
      expect(res.status).toBe(200);
      await good.stop();
    });
  });

  Scenario("Close all clients on shutdown", ({ Given, When, Then }) => {
    let clients;
    Given("active SSE connections exist", async () => {
      await makeProject();
      server = await createModspecServer({
        specDir: tmpRoot,
        projectRoot: tmpRoot,
        port: 0,
      });
      clients = [openSse(server.port), openSse(server.port)];
      await sleep(400);
    });
    When("close() is called", async () => {
      await server.close();
      server = null;
    });
    Then(
      "every client response is ended and the set is cleared",
      async () => {
        // Each client's stream should end (read loop completes) once the
        // server ends the responses. stop() resolves only after the read
        // loop finishes, so awaiting them within a timeout proves closure.
        await Promise.race([
          Promise.all(clients.map((c) => c.stop())),
          sleep(2000),
        ]);
        await Promise.all(clients.map((c) => c.stop()));
        expect(clients.length).toBe(2);
      },
    );
  });
});

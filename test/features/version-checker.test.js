import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi, afterAll } from "vitest";

// Mock fs/promises so getCurrentVersion's package.json read can be controlled.
// readFile defaults to the real implementation so the final scenario can
// exercise actual I/O against the project's package.json.
vi.mock("fs/promises", async () => {
  const actual = await vi.importActual("fs/promises");
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const actualFs = await vi.importActual("fs/promises");
const { readFile } = await import("fs/promises");
const { getCurrentVersion, checkForUpdate } = await import("../../src/version.js");

const feature = await loadFeature(
  "features/version-checker/update-check.feature",
);

// Stub getCurrentVersion's package.json read by intercepting fs/promises.readFile.
function stubCurrentVersion(version) {
  readFile.mockReset();
  readFile.mockResolvedValue(JSON.stringify({ version }));
}

// vitest-cucumber executes each Given/When/Then as a separate test, so tearing
// mocks down in afterEach would wipe them before the When/Then steps run. Instead
// each scenario sets up its own state in its Given step; we only release fake
// timers / global stubs once all scenarios have finished.
afterAll(() => {
  readFile.mockReset();
  readFile.mockImplementation(actualFs.readFile);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describeFeature(feature, ({ Scenario }) => {
  let logSpy;

  Scenario("Notify when update is available", ({ Given, When, Then }) => {
    Given(
      'the current version is "0.2.1" and npm latest is "0.3.0"',
      () => {
        stubCurrentVersion("0.2.1");
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => ({
            ok: true,
            json: async () => ({ version: "0.3.0" }),
          })),
        );
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      },
    );
    When("checkForUpdate completes", async () => {
      await checkForUpdate();
    });
    Then('a message is logged: "Update available: 0.2.1 → 0.3.0"', () => {
      expect(logSpy).toHaveBeenCalledTimes(1);
      const message = logSpy.mock.calls[0].join(" ");
      expect(message).toContain("Update available: 0.2.1 → 0.3.0");
    });
  });

  Scenario("Stay silent when up to date", ({ Given, When, Then }) => {
    Given("the current version matches the npm latest", () => {
      stubCurrentVersion("1.2.3");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({ version: "1.2.3" }),
        })),
      );
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });
    When("checkForUpdate completes", async () => {
      await checkForUpdate();
    });
    Then("nothing is logged", () => {
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  Scenario("Silently handle network errors", ({ Given, When, Then }) => {
    Given("the npm registry is unreachable", () => {
      stubCurrentVersion("0.2.1");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("ECONNREFUSED");
        }),
      );
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });
    let error = null;
    When("checkForUpdate runs", async () => {
      try {
        await checkForUpdate();
      } catch (e) {
        error = e;
      }
    });
    Then("no error is thrown and no output is produced", () => {
      expect(error).toBeNull();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  Scenario("Abort after 3 seconds", ({ Given, When, Then }) => {
    let aborted = false;
    Given("the registry response takes longer than 3 seconds", () => {
      stubCurrentVersion("0.2.1");
      // fetch rejects when its abort signal fires, mimicking a cancelled request.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url, opts) =>
            new Promise((_resolve, reject) => {
              const signal = opts && opts.signal;
              if (signal) {
                signal.addEventListener("abort", () => {
                  aborted = true;
                  reject(
                    Object.assign(new Error("aborted"), { name: "AbortError" }),
                  );
                });
              }
            }),
        ),
      );
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });
    let error = null;
    When("the AbortController fires", async () => {
      vi.useFakeTimers();
      const promise = checkForUpdate();
      // let getCurrentVersion's awaited read settle so the 3s timeout registers
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      try {
        await promise;
      } catch (e) {
        error = e;
      }
    });
    Then("the fetch is cancelled and the function resolves silently", () => {
      expect(aborted).toBe(true);
      expect(error).toBeNull();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  Scenario("Read current version from package.json", ({ Given, When, Then }) => {
    let version;
    Given(
      "src/version.js resolves package.json relative to its own directory",
      () => {
        // exercise the real fs read against the real package.json
        readFile.mockReset();
        readFile.mockImplementation(actualFs.readFile);
      },
    );
    When("getCurrentVersion is called", async () => {
      version = await getCurrentVersion();
    });
    Then("the version field from package.json is returned", () => {
      expect(typeof version).toBe("string");
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});

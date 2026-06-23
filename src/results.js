import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";

/**
 * Conventional Cucumber JSON report filenames, checked in order. Root-level
 * matches are preferred over the same filename inside a results directory.
 */
const RESULTS_FILENAMES = [
  "cucumber.json",
  "cucumber-report.json",
  "cucumber_report.json",
  "vitest-results.json",
  "jest-results.json",
  "test-results.json",
  "results.json",
];

/** Conventional directories a runner may drop its report into. */
const RESULTS_DIRS = ["results", "reports", "test-results", "cucumber"];

/**
 * Status severity, highest first. A scenario/feature/spec rolls up to the
 * highest-severity status present. `passed` is the lowest severity so that a
 * group passes only when every member passes.
 */
const SEVERITY = ["failed", "ambiguous", "undefined", "pending", "skipped", "passed"];

/**
 * Return the highest-severity status from a list, or null if the list is empty.
 *
 * @param {string[]} statuses
 * @returns {string|null}
 */
export function rollupStatus(statuses) {
  let best = null;
  let bestRank = Infinity;
  for (const status of statuses) {
    const rank = SEVERITY.indexOf(status);
    if (rank === -1) continue;
    if (rank < bestRank) {
      bestRank = rank;
      best = status;
    }
  }
  return best;
}

/**
 * Derive a single scenario status from its Cucumber step results.
 * A scenario with no steps is `undefined` (no defined behavior).
 *
 * @param {Array} steps - Cucumber step objects with `result.status`
 * @returns {string}
 */
export function deriveScenarioStatus(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return "undefined";
  }
  const statuses = steps.map((s) => s?.result?.status).filter(Boolean);
  return rollupStatus(statuses) || "undefined";
}

/**
 * Normalize a test report into a lookup keyed by feature name. The input format
 * is auto-detected: a top-level array is treated as Cucumber JSON, a top-level
 * object with `testResults` as a Jest/vitest JSON report. Accepts a parsed
 * value or a JSON string. Tolerates missing fields.
 *
 * @param {Array|Object|string} report
 * @returns {Object} { [featureName]: { name, scenarios: { [scenarioName]: status } } }
 */
export function normalizeResults(report) {
  let data = report;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (Array.isArray(data)) {
    return normalizeCucumberResults(data);
  }
  if (data && Array.isArray(data.testResults)) {
    return normalizeVitestResults(data);
  }
  return {};
}

/**
 * Normalize a Cucumber JSON report (array of feature objects) into a lookup.
 */
function normalizeCucumberResults(data) {
  const lookup = {};
  for (const feature of data) {
    if (!feature || !feature.name) continue;
    const scenarios = {};
    for (const element of feature.elements || []) {
      if (!element || !element.name) continue;
      if (element.type && element.type !== "scenario") continue;
      scenarios[element.name] = deriveScenarioStatus(element.steps);
    }
    lookup[feature.name] = { name: feature.name, scenarios };
  }
  return lookup;
}

/** Jest/vitest statuses mapped onto the Cucumber status vocabulary. */
const VITEST_STATUS = {
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  pending: "pending",
  todo: "pending",
};

/**
 * Derive a (feature, scenario) key for a Jest/vitest assertion. For
 * `vitest-cucumber` the ancestor titles are `"Feature: <name>"` /
 * `"Scenario: <name>"`; otherwise the top-level describe is the feature and the
 * assertion title is the scenario.
 */
function mapVitestTitles(assertion) {
  const ancestors = assertion.ancestorTitles || [];
  const top = ancestors[0] || "";
  if (top.startsWith("Feature:") && ancestors[1]) {
    const feature = top.slice("Feature:".length).trim();
    const second = ancestors[1];
    const scenario = second.startsWith("Scenario:")
      ? second.slice("Scenario:".length).trim()
      : second;
    return { feature, scenario };
  }
  return { feature: top || null, scenario: assertion.title || null };
}

/**
 * Normalize a Jest/vitest JSON report into a lookup. Assertions are grouped by
 * (feature, scenario) and rolled up — so the multiple step assertions a
 * vitest-cucumber scenario produces collapse to a single scenario status.
 */
function normalizeVitestResults(data) {
  const acc = {}; // feature -> scenario -> string[]
  for (const file of data.testResults || []) {
    for (const assertion of file.assertionResults || []) {
      const { feature, scenario } = mapVitestTitles(assertion);
      if (!feature || !scenario) continue;
      const status = VITEST_STATUS[assertion.status] || assertion.status;
      if (!acc[feature]) acc[feature] = {};
      if (!acc[feature][scenario]) acc[feature][scenario] = [];
      acc[feature][scenario].push(status);
    }
  }

  const lookup = {};
  for (const [feature, scenarios] of Object.entries(acc)) {
    const sc = {};
    for (const [name, statuses] of Object.entries(scenarios)) {
      sc[name] = rollupStatus(statuses) || "undefined";
    }
    lookup[feature] = { name: feature, scenarios: sc };
  }
  return lookup;
}

/**
 * Read a Cucumber JSON results file and return the normalized lookup.
 * Returns null if the file is missing or unparseable (graceful degradation).
 *
 * @param {string} filePath
 * @returns {Promise<Object|null>}
 */
export async function parseResultsFile(filePath) {
  let content;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
  try {
    return normalizeResults(JSON.parse(content));
  } catch {
    return null;
  }
}

/**
 * Locate a Cucumber JSON results file.
 *
 * An explicit path always wins — it is resolved to absolute and returned even
 * if it does not exist yet (so a watcher can pick it up once written).
 * Otherwise the conventional locations under `projectRoot` are probed in order
 * (root-level filenames first, then the same filenames inside results
 * directories) and the first existing file is returned, or `null` if none.
 *
 * @param {string} projectRoot
 * @param {string|null} [explicitPath]
 * @returns {string|null} absolute path or null
 */
export function resolveResultsPath(projectRoot, explicitPath) {
  if (explicitPath) {
    return resolve(explicitPath);
  }
  const candidates = [
    ...RESULTS_FILENAMES.map((f) => join(projectRoot, f)),
    ...RESULTS_DIRS.flatMap((dir) =>
      RESULTS_FILENAMES.map((f) => join(projectRoot, dir, f)),
    ),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Tally a list of statuses into { passed, failed, total }, where `total`
 * counts only entries that carry result data (non-null).
 */
function tally(statuses) {
  const counts = { passed: 0, failed: 0, total: 0 };
  for (const status of statuses) {
    if (status == null) continue;
    counts.total += 1;
    if (status === "passed") counts.passed += 1;
    else if (status === "failed") counts.failed += 1;
  }
  return counts;
}

/**
 * Merge a normalized results lookup onto parsed specs in place.
 *
 * Annotates each `spec.featureFiles[].scenarios[]` with a `status` (null when
 * no matching result), each feature file with `testStatus` + `testCounts`, and
 * each spec with `testStatus` + `testCounts`. A feature or spec with no matched
 * results has `testStatus: null`.
 *
 * @param {Array} specs
 * @param {Object} lookup - output of normalizeResults / parseResultsFile
 * @returns {Array} the same specs array, annotated
 */
export function mergeResults(specs, lookup = {}) {
  for (const spec of specs) {
    const specStatuses = [];

    for (const feature of spec.featureFiles || []) {
      const featureResults = lookup[feature.name]?.scenarios || {};
      const statuses = [];

      for (const scenario of feature.scenarios || []) {
        const status = Object.prototype.hasOwnProperty.call(
          featureResults,
          scenario.name,
        )
          ? featureResults[scenario.name]
          : null;
        scenario.status = status;
        statuses.push(status);
      }

      const present = statuses.filter((s) => s != null);
      feature.testStatus = rollupStatus(present);
      feature.testCounts = tally(statuses);
      specStatuses.push(...present);
    }

    spec.testStatus = rollupStatus(specStatuses);
    spec.testCounts = tally(specStatuses);
  }
  return specs;
}

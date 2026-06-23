---
name: results-parser
description: Parses language-agnostic Cucumber JSON test results and merges scenario pass/fail status onto specs
group: foundation
tags: [parser, test-results, cucumber, bdd]
depends_on:
  - name: feature-parser
    uses: [file-parsing]
features: features/results-parser/
---

# Results Parser

Ingests a **Cucumber JSON** test report and merges per-scenario pass/fail status onto the parsed spec model, so the graph can visualize test outcomes. Implemented in `src/results.js`.

modspec never runs tests — it consumes a results artifact. Cucumber JSON is chosen because it is emitted by every Gherkin runner (cucumber-js, cucumber-jvm, behave, cucumber-ruby, godog, Reqnroll, cucumber-rs), making the feature language-agnostic. It maps 1:1 onto modspec's existing `feature → scenario` model.

### Supported formats

Two report formats are accepted, distinguished by shape:

1. **Cucumber JSON** — a top-level **array** of feature objects. The primary, language-agnostic format.
2. **Jest / vitest JSON** — a top-level **object** with a `testResults` array (the `--reporter=json` output, common across the JS ecosystem). Each assertion's `ancestorTitles` and `title` are mapped onto features and scenarios; for `vitest-cucumber` runs the titles are `"Feature: <name>"` / `"Scenario: <name>"`, so they join directly. For a plain `describe`/`it` suite the top-level `describe` is the feature and the `it` title is the scenario. Multiple assertions under one scenario (e.g. Gherkin steps) are rolled up to a single scenario status. Statuses map `passed`/`failed`/`skipped`/`pending` through unchanged and `todo` → `pending`.

`normalizeResults` and `parseResultsFile` detect the format automatically: array ⇒ Cucumber, object with `testResults` ⇒ Jest/vitest.

### Cucumber JSON shape

The report is an array of feature objects. Each feature has a `name` (the kebab-case `Feature:` name) and an `elements` array of scenarios. Each scenario has a `name` and a `steps` array, where each step carries `result.status`.

```json
[
  {
    "name": "user-login",
    "elements": [
      {
        "type": "scenario",
        "name": "Successful login",
        "steps": [{ "keyword": "Given ", "result": { "status": "passed" } }]
      }
    ]
  }
]
```

### Scenario status derivation

A scenario's status is the **highest-severity** status among its steps, by precedence:

```
failed > ambiguous > undefined > pending > skipped > passed
```

A scenario passes only when every step passes. A scenario with no steps is `undefined`.

### Public API

- `deriveScenarioStatus(steps)` — rolls a scenario's step results up to a single status string.
- `rollupStatus(statuses)` — returns the highest-severity status from a list (used for feature- and spec-level rollups).
- `normalizeResults(report)` — turns a raw report into a lookup `{ [featureName]: { name, scenarios: { [scenarioName]: status } } }`, auto-detecting the input format (see below). Accepts a parsed value or a JSON string. Tolerates missing/malformed fields.
- `parseResultsFile(filePath)` — reads a JSON file and returns the normalized lookup. Returns `null` if the file is missing or unparseable (graceful degradation — no throw), mirroring `parseFeatureDirectory`.
- `resolveResultsPath(projectRoot, explicitPath)` — locates the results file. An explicit path always wins (resolved to absolute, returned even if it doesn't exist yet so it can be watched). Otherwise auto-detects by checking a predefined ordered list of conventional locations under `projectRoot` and returning the first that exists, or `null` if none match.
- `mergeResults(specs, resultsLookup)` — annotates each `spec.featureFiles[].scenarios[]` with a `status`, each feature file with `testStatus` + `testCounts`, and each spec with `testStatus` + `testCounts`.

### Auto-detection

When no explicit `--results` path is given, modspec looks for a Cucumber JSON report in conventional places. Root-level report filenames are checked first, then the same filenames inside common results directories:

- **Filenames:** `cucumber.json`, `cucumber-report.json`, `cucumber_report.json`, `vitest-results.json`, `jest-results.json`, `test-results.json`, `results.json`
- **Directories:** `results/`, `reports/`, `test-results/`, `cucumber/`

Any matched file is content-sniffed, so a Jest/vitest report works at any of these locations too.

The first existing match (in that order — root files before directory files) is used. This keeps zero-config the common case where a runner drops `results/cucumber.json` in the project root.

### Merge semantics

- Features join on **feature name** (kebab-case), scenarios join on exact **scenario name**.
- A scenario in a spec with no matching result gets `status: null` (no data).
- `testCounts` is `{ passed, failed, total }` where `total` counts only scenarios that have result data.
- A feature or spec with zero matched results has `testStatus: null` — the graph renders this as a neutral "no data" state, distinct from a real pass/fail.

### Integration (downstream)

The dev server watches the results file alongside specs/features and re-runs `mergeResults` on change, broadcasting via SSE. `graph-generator` and `graph-client` read `testStatus`/`testCounts`/per-scenario `status` to colour nodes and annotate the side panel. Those concerns live in their own specs; this spec owns only parsing and merging.

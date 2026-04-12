---
name: feature-parser
description: Parses Gherkin .feature files — extracts feature names, scenarios, and Given/When/Then steps
group: foundation
tags: [parser, gherkin, feature-files, bdd]
depends_on: []
features: features/feature-parser/
---

# Feature Parser

Reads `.feature` files and extracts structured scenario data. Implemented in `src/parser.js` — the `parseFeatureFile` and `parseFeatureDirectory` exports.

### Single file parsing

`parseFeatureFile(filePath, options)` reads a `.feature` file line-by-line and extracts:

- **Feature name**: from the `Feature:` header line
- **Scenarios**: each `Scenario:` block collects its name and steps
- **Steps**: lines starting with `Given`, `When`, `Then`, `And`, or `But`
- **Raw content**: full file content preserved for display/editing
- **Filename**: base filename for identification
- **Relative path**: computed from `options.basePath` if provided

### Directory parsing

`parseFeatureDirectory(dirPath, options)` scans a directory for `.feature` files, parses all of them in parallel via `Promise.all`, and returns an array. Returns an empty array if the directory doesn't exist (graceful degradation — no throw).

### Integration with spec-parser

The spec-parser calls `parseFeatureDirectory` for each spec that has a `features` path, joining `projectRoot + spec.features` to locate the feature directory. Results are attached as `spec.featureFiles`.

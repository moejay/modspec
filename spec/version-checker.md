---
name: version-checker
description: Non-blocking npm registry check for available updates to @moejay/modspec
group: infrastructure
tags: [version, npm, update-notification]
depends_on: []
features: features/version-checker/
---

# Version Checker

Checks the npm registry for a newer published version and logs an upgrade notification. Implemented in `src/version.js` (49 lines).

### How it works

1. Reads current version from `package.json` (resolved relative to `src/` via `import.meta.url`)
2. Fetches `https://registry.npmjs.org/@moejay/modspec/latest` with a 3-second `AbortController` timeout
3. Compares `latest.version` against current — if different, logs: `Update available: X.Y.Z → A.B.C`
4. Silently swallows all errors (network failures, timeouts, JSON parse errors)

### Design constraints

- **Non-blocking**: called with `.catch(() => {})` by the orchestrator — never delays startup
- **No side effects beyond logging**: doesn't auto-update, doesn't write state, doesn't cache results
- **3-second hard timeout**: prevents hanging on slow/unreachable registries

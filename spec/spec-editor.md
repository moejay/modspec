---
name: spec-editor
description: Inline write-back of spec bodies and feature files from browser edits
group: infrastructure
tags: [editing, write-back, frontmatter-preservation]
depends_on:
  - name: spec-parser
    uses: [spec-format]
features: features/spec-editor/
---

# Spec Editor

Handles `PUT` requests from the browser-side inline editor to update spec and feature files on disk. Implemented as part of `src/server.js`.

### Spec body editing (`PUT /api/specs/:name/body`)

1. Looks up the spec file path from a `name → filePath` map built by scanning the spec directory
2. Reads the current file content, extracts frontmatter via `gray-matter`
3. Reconstructs the file using `matter.stringify(newBody, originalFrontmatter)` — preserves all YAML fields unchanged
4. Writes the updated file, which triggers the file-watcher → re-parse → broadcast cycle

### Feature file editing (`PUT /api/features/:specName/:filename`)

1. Finds the spec by name, resolves the feature path as `projectRoot + spec.features + filename`
2. Writes the raw content directly (feature files have no frontmatter to preserve)
3. File-watcher picks up the change automatically

### Spec file map

`buildSpecFileMap(specDir)` scans the spec directory, reads each `.md` file's frontmatter to extract the `name`, and returns a `{ [specName]: absolutePath }` lookup. Rebuilt on every file change to handle added/removed specs.

### Error handling

- Missing spec → 404 with `{ error: "Spec not found" }`
- Missing spec or features path → 404
- Write/parse failures → 500 with error message

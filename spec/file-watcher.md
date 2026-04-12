---
name: file-watcher
description: Watches spec and feature files on disk via chokidar, debounces changes, triggers re-parse
group: infrastructure
tags: [chokidar, file-watching, debounce, polling]
depends_on:
  - name: spec-parser
    uses: [directory-parsing]
features: features/file-watcher/
---

# File Watcher

Monitors the spec directory and all referenced feature directories for file changes. Implemented as part of `src/server.js` using the `chokidar` library.

### Watch configuration

- **Paths watched**: the spec directory plus every feature directory referenced by parsed specs (`projectRoot + spec.features`)
- **Polling mode**: `usePolling: true` with 100ms interval — ensures reliable detection across filesystems (Docker volumes, NFS, etc.)
- **Ignore initial**: set to `true` so existing files don't trigger events on startup
- **Events**: listens for `add`, `change`, and `unlink` on `.md` and `.feature` files only

### Debouncing

Rapid file changes (e.g., editor save + lint fix in quick succession) are debounced with a 100ms window. Only one re-parse + broadcast fires per debounce window. The timer is cleared on shutdown.

### Re-parse cycle

On debounced file change:
1. Re-parses the entire spec directory (including feature files)
2. Rebuilds the spec file path map (for the editor to know which file to write back)
3. Updates the in-memory `specs` array
4. Delegates broadcast to the SSE broadcaster

### Cleanup

The watcher's `close()` is called during graceful shutdown, releasing file handles and stopping polling.

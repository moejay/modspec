---
name: http-server
description: Node.js HTTP server — routes requests to spec data, HTML, SSE, and editing endpoints
group: infrastructure
tags: [http, server, node, rest-api]
depends_on:
  - name: spec-parser
    uses: [directory-parsing]
  - name: graph-generator
    uses: [html-generation]
  - name: file-watcher
    uses: [file-change-detection]
  - name: sse-broadcaster
    uses: [event-streaming]
  - name: spec-editor
    uses: [spec-write-back, feature-write-back]
features: features/http-server/
---

# HTTP Server

Development server implemented with Node's built-in `http` module — no Express, no framework. Defined in `src/server.js` as `createModspecServer({ specDir, port, projectRoot })`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` or `/index.html` | Serves generated HTML with `liveReload: true` |
| `GET` | `/api/specs` | Returns parsed specs as JSON |
| `GET` | `/api/events` | SSE stream for live updates |
| `PUT` | `/api/specs/:name/body` | Update spec body (preserves frontmatter) |
| `PUT` | `/api/features/:specName/:filename` | Update feature file content |

### Server lifecycle

- Binds to configured port (default 3333, supports `0` for random port in tests)
- Returns a promise resolving to `{ port, address, close }` — the `close()` function tears down the watcher, closes SSE connections, and stops the HTTP server
- Graceful shutdown is triggered by the orchestrator on `SIGINT`/`SIGTERM`

### Request handling

Incoming requests are URL-matched against route patterns. PUT endpoints parse JSON body via a `readBody()` helper that collects chunks. Unmatched routes get 404. All responses include `Cache-Control: no-cache`.

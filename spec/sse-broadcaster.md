---
name: sse-broadcaster
description: Manages SSE client connections and pushes spec update events to connected browsers
group: infrastructure
tags: [sse, server-sent-events, push, real-time]
depends_on: []
features: features/sse-broadcaster/
---

# SSE Broadcaster

Manages Server-Sent Event connections for real-time spec updates. Implemented as part of `src/server.js`.

### Connection management

- Maintains a `Set<Response>` of active SSE clients
- On `GET /api/events`: sets SSE headers (`text/event-stream`, `Connection: keep-alive`, CORS), writes an initial `: connected` comment, adds the response to the client set
- On client disconnect (`req.on('close')`): removes the response from the set
- On shutdown: iterates all clients, calls `res.end()`, and clears the set

### Broadcasting

`broadcastUpdate(specs)` serializes the new spec array as JSON and writes it as an SSE `data:` frame to every connected client. Failed writes (broken connections) silently remove the client from the set.

### Client-side counterpart

The graph-client embeds a `connectSSE()` function that:
- Opens an `EventSource` to `/api/events`
- On message: parses JSON and calls `updateGraph()` to hot-swap spec data
- On error: closes and reconnects after 2 seconds (exponential backoff not needed — local dev only)

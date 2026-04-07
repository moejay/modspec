import http from "http";
import chokidar from "chokidar";
import { readFile, writeFile } from "fs/promises";
import { join, dirname, resolve } from "path";
import matter from "gray-matter";
import { parseSpecDirectory } from "./parser.js";
import { generateHTML } from "./generator.js";

/**
 * Create a modspec dev server with file watching and SSE.
 *
 * @param {Object} options
 * @param {string} options.specDir - Path to the spec directory
 * @param {number} options.port - Port to listen on (0 for random)
 * @returns {Promise<{port: number, address: string, close: () => Promise<void>}>}
 */
export async function createModspecServer({ specDir, port = 3333, projectRoot: explicitRoot } = {}) {
  // Project root is explicit or parent of the spec directory
  const projectRoot = explicitRoot || dirname(resolve(specDir));

  let specs = await parseSpecDirectory(specDir, { projectRoot });

  // Map spec file paths by name for write-back operations
  const specFilePaths = await buildSpecFileMap(specDir);

  const sseClients = new Set();

  let debounceTimer = null;

  function broadcastUpdate(newSpecs) {
    const message = `data: ${JSON.stringify({ specs: newSpecs })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(message);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  async function handleFileChange() {
    try {
      const newSpecs = await parseSpecDirectory(specDir, { projectRoot });
      specs = newSpecs;

      // Rebuild file map in case files were added/removed
      const newMap = await buildSpecFileMap(specDir);
      Object.keys(specFilePaths).forEach((k) => delete specFilePaths[k]);
      Object.assign(specFilePaths, newMap);

      broadcastUpdate(specs);
    } catch (err) {
      console.error("Error re-parsing specs:", err.message);
    }
  }

  function debouncedFileChange() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleFileChange, 100);
  }

  // Collect feature directories to watch
  const featureDirs = specs
    .filter((s) => s.features)
    .map((s) => join(projectRoot, s.features));

  // Set up file watcher for spec dir and feature dirs
  const watchPaths = [specDir, ...featureDirs];
  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    usePolling: true,
    interval: 100,
  });

  const watcherReady = new Promise((resolve) => watcher.on("ready", resolve));

  function onFileEvent(filePath) {
    if (filePath.endsWith(".md") || filePath.endsWith(".feature")) {
      debouncedFileChange();
    }
  }

  watcher.on("add", onFileEvent);
  watcher.on("change", onFileEvent);
  watcher.on("unlink", onFileEvent);

  /**
   * Read the request body as a string.
   */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = generateHTML(specs, { liveReload: true });
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/specs" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(specs));
      return;
    }

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");

      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // PUT /api/specs/:name/body
    const specBodyMatch = url.pathname.match(
      /^\/api\/specs\/([^/]+)\/body$/,
    );
    if (specBodyMatch && req.method === "PUT") {
      const specName = decodeURIComponent(specBodyMatch[1]);
      const filePath = specFilePaths[specName];

      if (!filePath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Spec not found" }));
        return;
      }

      try {
        const rawBody = await readBody(req);
        const { body: newBody } = JSON.parse(rawBody);

        const fileContent = await readFile(filePath, "utf-8");
        const { data } = matter(fileContent);

        // Reconstruct file with original frontmatter and new body
        const updatedContent = matter.stringify(newBody, data);
        await writeFile(filePath, updatedContent, "utf-8");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // PUT /api/features/:specName/:filename
    const featureMatch = url.pathname.match(
      /^\/api\/features\/([^/]+)\/([^/]+)$/,
    );
    if (featureMatch && req.method === "PUT") {
      const specName = decodeURIComponent(featureMatch[1]);
      const filename = decodeURIComponent(featureMatch[2]);

      const spec = specs.find((s) => s.name === specName);
      if (!spec || !spec.features) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Spec or features path not found" }));
        return;
      }

      const featurePath = join(projectRoot, spec.features, filename);

      try {
        const rawBody = await readBody(req);
        const { content } = JSON.parse(rawBody);

        await writeFile(featurePath, content, "utf-8");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  await watcherReady;

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        address: `http://localhost:${addr.port}`,
        close: async () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          await watcher.close();

          // Close all SSE connections
          for (const client of sseClients) {
            client.end();
          }
          sseClients.clear();

          return new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });

    server.on("error", reject);
  });
}

/**
 * Build a map of spec name -> file path by scanning the spec directory.
 */
async function buildSpecFileMap(specDir) {
  const { readdir } = await import("fs/promises");
  const { extname } = await import("path");
  const entries = await readdir(specDir);
  const map = {};

  for (const entry of entries) {
    if (extname(entry) !== ".md") continue;
    const filePath = join(specDir, entry);
    try {
      const content = await readFile(filePath, "utf-8");
      const { data } = matter(content);
      if (data.name) {
        map[data.name] = filePath;
      }
    } catch {
      // skip unreadable files
    }
  }

  return map;
}

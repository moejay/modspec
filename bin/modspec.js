#!/usr/bin/env node

import { parseSpecDirectory } from "../src/parser.js";
import { generateHTML } from "../src/generator.js";
import { createModspecServer } from "../src/server.js";
import { parseCliArgs } from "../src/cli.js";
import { checkForUpdate } from "../src/version.js";
import { writeFile, mkdtemp, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { existsSync } from "fs";
import { createInterface } from "readline";

const HELP_TEXT = `
modspec — Visualize spec file dependencies as an interactive graph

Usage:
  modspec <directory>                   Start dev server with live reload (default)
  modspec <directory> --output <file>   Save graph to a static HTML file
  modspec <directory> --port <number>   Custom port for dev server (default: 3333)

Options:
  --output, -o  Save the HTML file to the specified path instead of serving
  --port        Port for the dev server (default: 3333)
  -y, --yes     Auto-create the spec directory if it doesn't exist
  --help, -h    Show this help message

Examples:
  modspec ./spec/
  modspec ./spec/ --port 4000
  modspec ./spec/ --output graph.html
  modspec ./spec/ -y
`;

async function promptUser(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (opts.error) {
    console.error(`Error: ${opts.error}`);
    process.exit(1);
  }

  // Check for updates (non-blocking)
  checkForUpdate().catch(() => {});

  const dirPath = resolve(opts.specDir);

  if (!existsSync(dirPath)) {
    if (opts.yes) {
      await mkdir(dirPath, { recursive: true });
      console.log(`Created spec directory: ${dirPath}`);
    } else {
      const answer = await promptUser(
        `Directory not found: ${dirPath}\nCreate it? [y/N] `,
      );
      if (answer === "y" || answer === "yes") {
        await mkdir(dirPath, { recursive: true });
        console.log(`Created spec directory: ${dirPath}`);
      } else {
        console.error("Aborted.");
        process.exit(1);
      }
    }
  }

  // Parse specs with project root (parent of spec directory)
  const projectRoot = dirname(dirPath);
  const specs = await parseSpecDirectory(dirPath, { projectRoot });

  if (specs.length === 0) {
    console.log("No valid modspec files found in:", dirPath);
    process.exit(0);
  }

  console.log(`Found ${specs.length} spec(s): ${specs.map(s => s.name).join(", ")}`);

  if (opts.mode === "static") {
    // Static export mode
    const html = generateHTML(specs);

    if (opts.outputPath) {
      await writeFile(opts.outputPath, html, "utf-8");
      console.log(`Graph saved to: ${opts.outputPath}`);
    } else {
      // Write to temp file and open in browser
      const tmpDir = await mkdtemp(join(tmpdir(), "modspec-"));
      const tmpFile = join(tmpDir, "graph.html");
      await writeFile(tmpFile, html, "utf-8");

      const open = (await import("open")).default;
      await open(tmpFile);
      console.log(`Graph opened in browser (${tmpFile})`);
    }
  } else {
    // Dev server mode (default)
    const server = await createModspecServer({
      specDir: dirPath,
      port: opts.port,
    });

    console.log(`modspec serving at ${server.address} (watching ${dirPath})`);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the current package version from package.json.
 */
export async function getCurrentVersion() {
  const pkg = JSON.parse(
    await readFile(join(__dirname, "..", "package.json"), "utf-8"),
  );
  return pkg.version;
}

/**
 * Check npm registry for the latest version and log a message if an update is available.
 * This is intentionally non-blocking and swallows errors silently.
 */
export async function checkForUpdate() {
  const current = await getCurrentVersion();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      "https://registry.npmjs.org/@moejay/modspec/latest",
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = await res.json();
    const latest = data.version;

    if (latest && latest !== current) {
      console.log(
        `\n  Update available: ${current} → ${latest}` +
        `\n  Run \`npm install -g @moejay/modspec\` to upgrade\n`,
      );
    }
  } catch {
    // Network errors, timeouts — silently ignore
  }
}

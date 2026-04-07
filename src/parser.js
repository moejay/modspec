import matter from "gray-matter";
import { readFile, readdir, access } from "fs/promises";
import { join, extname, relative, basename } from "path";

/**
 * Parse a single markdown file and extract modspec frontmatter.
 * Returns null if the file lacks valid modspec frontmatter (must have `name`).
 */
export async function parseSpecFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  const { data, content: body } = matter(content);

  if (!data.name) {
    return null;
  }

  return {
    name: data.name,
    description: data.description || "",
    depends_on: data.depends_on || [],
    features: data.features || "",
    body: body.trim() ? body.trim() + "\n" : "",
  };
}

/**
 * Parse a single .feature file and extract Feature name, Scenario names, and raw content.
 *
 * @param {string} filePath - absolute path to the .feature file
 * @param {Object} [options]
 * @param {string} [options.basePath] - base path for computing relative path
 * @returns {Object} parsed feature data
 */
export async function parseFeatureFile(filePath, options = {}) {
  const content = await readFile(filePath, "utf-8");
  const filename = basename(filePath);

  let name = "";
  const scenarios = [];
  let currentScenario = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const featureMatch = trimmed.match(/^Feature:\s*(.+)/);
    if (featureMatch) {
      name = featureMatch[1].trim();
      continue;
    }
    const scenarioMatch = trimmed.match(/^Scenario:\s*(.+)/);
    if (scenarioMatch) {
      currentScenario = { name: scenarioMatch[1].trim(), steps: [] };
      scenarios.push(currentScenario);
      continue;
    }
    if (currentScenario && /^(Given|When|Then|And|But)\s+/.test(trimmed)) {
      currentScenario.steps.push(trimmed);
    }
  }

  const result = { filename, name, content, scenarios };

  if (options.basePath) {
    result.path = relative(options.basePath, filePath);
  }

  return result;
}

/**
 * Parse all .feature files in a directory.
 * Returns empty array if directory does not exist or has no .feature files.
 *
 * @param {string} dirPath - absolute path to feature directory
 * @param {Object} [options]
 * @param {string} [options.basePath] - base path for computing relative paths
 * @returns {Promise<Array>} parsed feature data
 */
export async function parseFeatureDirectory(dirPath, options = {}) {
  try {
    await access(dirPath);
  } catch {
    return [];
  }

  const entries = await readdir(dirPath);
  const featureFiles = entries
    .filter((f) => extname(f) === ".feature")
    .map((f) => join(dirPath, f));

  if (featureFiles.length === 0) {
    return [];
  }

  return Promise.all(
    featureFiles.map((f) => parseFeatureFile(f, options)),
  );
}

/**
 * Parse all .md files in a directory and return an array of valid modspec entries.
 * Files without valid modspec frontmatter are silently skipped.
 *
 * @param {string} dirPath - path to the spec directory
 * @param {Object} [options]
 * @param {string} [options.projectRoot] - project root for resolving feature paths
 */
export async function parseSpecDirectory(dirPath, options = {}) {
  const entries = await readdir(dirPath);
  const mdFiles = entries
    .filter((f) => extname(f) === ".md")
    .map((f) => join(dirPath, f));

  const results = await Promise.all(mdFiles.map(parseSpecFile));
  const specs = results.filter((r) => r !== null);

  // Resolve feature files for each spec
  for (const spec of specs) {
    if (spec.features && options.projectRoot) {
      const featuresDir = join(options.projectRoot, spec.features);
      spec.featureFiles = await parseFeatureDirectory(featuresDir, {
        basePath: options.projectRoot,
      });
    } else {
      spec.featureFiles = [];
    }
  }

  return specs;
}

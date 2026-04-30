const SUBCOMMANDS = ["list", "show", "features", "deps", "validate"];
const SUBCOMMANDS_REQUIRING_NAME = new Set(["show", "deps"]);

function isSubcommandKeyword(arg) {
  return SUBCOMMANDS.includes(arg);
}

/**
 * Parse CLI arguments for modspec.
 *
 * @param {string[]} args - process.argv.slice(2)
 * @returns {Object} parsed options
 */
export function parseCliArgs(args) {
  if (args.includes("--version") || args.includes("-v")) {
    return { version: true };
  }

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const json = args.includes("--json");
  const yes = args.includes("-y") || args.includes("--yes");

  // Subcommand mode: first arg is a known keyword.
  if (isSubcommandKeyword(args[0])) {
    const mode = args[0];
    const specDir = args[1];
    const name = args[2] && !args[2].startsWith("-") ? args[2] : null;

    if (SUBCOMMANDS_REQUIRING_NAME.has(mode) && !name) {
      return { error: `${mode} requires a spec name` };
    }

    return { mode, specDir, name, json, yes, help: false, version: false };
  }

  // Default mode: first non-flag arg is specDir, mode is serve or static.
  const specDir = args[0];

  let outputPath = null;
  let mode = "serve";
  const outputIdx = args.indexOf("--output");
  const outputShortIdx = args.indexOf("-o");
  const outputFlagIdx = outputIdx !== -1 ? outputIdx : outputShortIdx;

  if (outputFlagIdx !== -1) {
    outputPath = args[outputFlagIdx + 1];
    if (!outputPath || outputPath.startsWith("-")) {
      return { error: "--output requires a file path" };
    }
    mode = "static";
  }

  let port = 3333;
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1) {
    const portStr = args[portIdx + 1];
    if (!portStr || isNaN(Number(portStr))) {
      return { error: "--port requires a number" };
    }
    port = Number(portStr);
  }

  return {
    specDir,
    mode,
    outputPath,
    port,
    yes,
    json,
    help: false,
    version: false,
  };
}

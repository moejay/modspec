---
name: arg-parser
description: Pure CLI argument parser — extracts subcommand, flags, positional args, and mode from process.argv
group: interface
tags: [cli, args, parsing]
depends_on: []
features: features/arg-parser/
---

# Arg Parser

Stateless function (`parseCliArgs`) that takes a raw argument array and returns a structured options object. Has zero dependencies — no framework, no external library, no I/O.

Implemented in `src/cli.js`. Supports:

- **Subcommand keyword** (optional first non-flag arg): one of `list`, `show`, `features`, `deps`, `validate`. When present, sets `mode` to that keyword and shifts subsequent positional args (specDir, then optional spec name).
- **Positional `specDir`**: in subcommand mode, the second positional arg; otherwise the first non-flag arg.
- **Positional `name`**: third positional arg, used by `show` / `features` / `deps`. Required for `show` and `deps`; optional for `features` (omit to list features for all specs).
- **`--output` / `-o`**: switches `mode` to `static`, captures output file path. Mutually exclusive with subcommands.
- **`--port`**: custom port number for dev server (default 3333). Only meaningful in `serve` mode.
- **`--json`**: emit JSON instead of human-readable text. Only meaningful in subcommand modes (list / show / features / deps / validate).
- **`-y` / `--yes`**: auto-confirm directory creation prompts.
- **`--help` / `-h`**: help flag (also triggers when no args given).
- **`--version` / `-v`**: print version and exit.
- **Error reporting**: returns `{ error }` for invalid flag usage (e.g., `--output` without a path, `show` without a spec name).

### Mode values

| `mode` | Meaning |
|--------|---------|
| `serve` | Default — start dev server. |
| `static` | `--output` / `-o` was passed; render HTML to file. |
| `list` | Print all specs. |
| `show` | Print one spec's full info. |
| `features` | Print features (all or for one spec). |
| `deps` | Print dependency tree (forward + reverse) for one spec. |
| `validate` | Lint specs and features for broken refs / cycles / orphans. |

### Disambiguating subcommand vs. spec dir

A bare word that exactly matches a subcommand keyword is a subcommand. Anything else (including paths like `./spec/` or `/abs/spec/`, or directory names not in the keyword set) is treated as `specDir`. Users with a directory literally named `list` must invoke it with a path indicator (`./list/`).

Returns a plain object — never throws, never reads the filesystem, never calls `process.exit`. All side effects happen in the orchestrator.

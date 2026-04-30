import { analyzeGraph, buildAdjacency, formatCycle } from "./cycles.js";

function findSpec(specs, name) {
  if (!name) return null;
  const target = name.toLowerCase();
  return specs.find((s) => (s.name || "").toLowerCase() === target) || null;
}

function specSummary(spec) {
  return {
    name: spec.name,
    group: spec.group || "",
    description: spec.description || "",
    tags: spec.tags || [],
    dependsOn: (spec.depends_on || []).map((d) => ({
      name: d.name,
      uses: d.uses || [],
    })),
    features: (spec.featureFiles || []).map((f) => ({
      name: f.name,
      scenarios: (f.scenarios || []).map((s) => s.name),
      path: f.path || "",
    })),
    specPath: spec.specPath || "",
  };
}

function sortByGroupThenName(specs) {
  return [...specs].sort((a, b) => {
    const g = (a.group || "").localeCompare(b.group || "");
    return g !== 0 ? g : (a.name || "").localeCompare(b.name || "");
  });
}

export function listCommand(specs, options = {}) {
  const sorted = sortByGroupThenName(specs);

  if (options.json) {
    return {
      output: JSON.stringify(sorted.map(specSummary), null, 2),
      exitCode: 0,
    };
  }

  if (sorted.length === 0) {
    return { output: "No specs found.", exitCode: 0 };
  }

  const nameWidth = Math.max(4, ...sorted.map((s) => (s.name || "").length));
  const groupWidth = Math.max(
    1,
    ...sorted.map((s) => (s.group || "-").length),
  );

  const lines = [
    `${sorted.length} spec${sorted.length === 1 ? "" : "s"}:`,
  ];
  sorted.forEach((s, i) => {
    const name = (s.name || "").padEnd(nameWidth);
    const group = (s.group || "-").padEnd(groupWidth);
    const depCount = (s.depends_on || []).length;
    const featCount = (s.featureFiles || []).length;
    lines.push(
      `  ${i + 1}. ${name}  ${group}  ${depCount} dep${depCount === 1 ? "" : "s"}  ${featCount} feature${featCount === 1 ? "" : "s"}`,
    );
  });

  return { output: lines.join("\n"), exitCode: 0 };
}

export function showCommand(specs, options = {}) {
  const spec = findSpec(specs, options.name);
  if (!spec) {
    return {
      output: `Error: spec not found: ${options.name}`,
      exitCode: 1,
    };
  }

  // Reverse deps: who depends on this spec.
  const target = spec.name.toLowerCase();
  const dependents = specs
    .filter((s) =>
      (s.depends_on || []).some((d) => (d.name || "").toLowerCase() === target),
    )
    .map((s) => {
      const dep = (s.depends_on || []).find(
        (d) => (d.name || "").toLowerCase() === target,
      );
      return { name: s.name, uses: (dep && dep.uses) || [] };
    });

  if (options.json) {
    return {
      output: JSON.stringify(
        { ...specSummary(spec), body: spec.body || "", dependents },
        null,
        2,
      ),
      exitCode: 0,
    };
  }

  const lines = [];
  lines.push(`spec: ${spec.name}`);
  if (spec.group) lines.push(`group: ${spec.group}`);
  if (spec.description) lines.push(`description: ${spec.description}`);
  if (spec.tags && spec.tags.length) {
    lines.push(`tags: ${spec.tags.join(", ")}`);
  }
  if (spec.specPath) lines.push(`path: ${spec.specPath}`);

  lines.push("");
  lines.push("forward deps:");
  if (!spec.depends_on || spec.depends_on.length === 0) {
    lines.push("  (none)");
  } else {
    spec.depends_on.forEach((d) => {
      const uses = (d.uses && d.uses.length)
        ? `  uses: ${d.uses.join(", ")}`
        : "";
      lines.push(`  - ${d.name}${uses}`);
    });
  }

  lines.push("");
  lines.push("reverse deps:");
  if (dependents.length === 0) {
    lines.push("  (none)");
  } else {
    dependents.forEach((d) => {
      const uses = d.uses.length ? `  uses: ${d.uses.join(", ")}` : "";
      lines.push(`  - ${d.name}${uses}`);
    });
  }

  lines.push("");
  lines.push("features:");
  if (!spec.featureFiles || spec.featureFiles.length === 0) {
    lines.push("  (none)");
  } else {
    spec.featureFiles.forEach((f) => {
      const path = f.path ? `  (${f.path})` : "";
      lines.push(`  - ${f.name}${path}`);
      (f.scenarios || []).forEach((s) => {
        lines.push(`      • ${s.name}`);
      });
    });
  }

  if (spec.body) {
    lines.push("");
    lines.push(spec.body.trim());
  }

  return { output: lines.join("\n"), exitCode: 0 };
}

export function featuresCommand(specs, options = {}) {
  let scoped = specs;
  if (options.name) {
    const spec = findSpec(specs, options.name);
    if (!spec) {
      return {
        output: `Error: spec not found: ${options.name}`,
        exitCode: 1,
      };
    }
    scoped = [spec];
  }

  const flat = [];
  scoped.forEach((spec) => {
    (spec.featureFiles || []).forEach((f) => {
      flat.push({
        spec: spec.name,
        feature: f.name,
        scenarios: (f.scenarios || []).map((s) => s.name),
        path: f.path || "",
      });
    });
  });

  if (options.json) {
    return { output: JSON.stringify(flat, null, 2), exitCode: 0 };
  }

  if (flat.length === 0) {
    return { output: "No features found.", exitCode: 0 };
  }

  const lines = [];
  let currentSpec = null;
  flat.forEach((entry) => {
    if (entry.spec !== currentSpec) {
      if (currentSpec !== null) lines.push("");
      lines.push(`${entry.spec}:`);
      currentSpec = entry.spec;
    }
    const count = entry.scenarios.length;
    const path = entry.path ? `  (${entry.path})` : "";
    lines.push(
      `  - ${entry.feature}  ${count} scenario${count === 1 ? "" : "s"}${path}`,
    );
  });

  return { output: lines.join("\n"), exitCode: 0 };
}

function transitiveTree(adj, start) {
  const out = [];
  const seen = new Set();
  function walk(node, depth, path) {
    (adj[node] || []).forEach((n) => {
      if (path.has(n)) {
        out.push({ name: n, depth, cycle: true, repeat: false });
        return;
      }
      const repeat = seen.has(n);
      seen.add(n);
      out.push({ name: n, depth, cycle: false, repeat });
      if (!repeat) {
        const nextPath = new Set(path);
        nextPath.add(n);
        walk(n, depth + 1, nextPath);
      }
    });
  }
  walk(start, 0, new Set([start]));
  return out;
}

export function depsCommand(specs, options = {}) {
  const spec = findSpec(specs, options.name);
  if (!spec) {
    return {
      output: `Error: spec not found: ${options.name}`,
      exitCode: 1,
    };
  }

  const { adj } = buildAdjacency(specs);
  // Reverse adjacency
  const reverseAdj = {};
  specs.forEach((s) => {
    reverseAdj[s.name] = [];
  });
  Object.entries(adj).forEach(([src, targets]) => {
    targets.forEach((t) => {
      if (reverseAdj[t]) reverseAdj[t].push(src);
    });
  });

  // For uses lookup
  const usesMap = {};
  specs.forEach((s) => {
    (s.depends_on || []).forEach((d) => {
      usesMap[`${s.name}->${d.name}`] = d.uses || [];
    });
  });

  const forwardTree = transitiveTree(adj, spec.name);
  const reverseTree = transitiveTree(reverseAdj, spec.name);

  if (options.json) {
    return {
      output: JSON.stringify(
        {
          dependsOn: forwardTree,
          dependents: reverseTree,
        },
        null,
        2,
      ),
      exitCode: 0,
    };
  }

  const lines = [`deps for: ${spec.name}`];
  lines.push("");
  lines.push("forward (depends on):");
  if (forwardTree.length === 0) {
    lines.push("  (none)");
  } else {
    let parentStack = [spec.name];
    forwardTree.forEach((entry) => {
      parentStack = parentStack.slice(0, entry.depth + 1);
      const parent = parentStack[entry.depth];
      const uses = usesMap[`${parent}->${entry.name}`] || [];
      const indent = "  ".repeat(entry.depth + 1);
      const usesStr = uses.length ? `  uses: ${uses.join(", ")}` : "";
      const mark = entry.cycle ? " (cycle)" : entry.repeat ? " (see above)" : "";
      lines.push(`${indent}- ${entry.name}${usesStr}${mark}`);
      parentStack.push(entry.name);
    });
  }

  lines.push("");
  lines.push("reverse (depended on by):");
  if (reverseTree.length === 0) {
    lines.push("  (none)");
  } else {
    let parentStack = [spec.name];
    reverseTree.forEach((entry) => {
      parentStack = parentStack.slice(0, entry.depth + 1);
      const parent = parentStack[entry.depth];
      const uses = usesMap[`${entry.name}->${parent}`] || [];
      const indent = "  ".repeat(entry.depth + 1);
      const usesStr = uses.length ? `  uses: ${uses.join(", ")}` : "";
      const mark = entry.cycle ? " (cycle)" : entry.repeat ? " (see above)" : "";
      lines.push(`${indent}- ${entry.name}${usesStr}${mark}`);
      parentStack.push(entry.name);
    });
  }

  return { output: lines.join("\n"), exitCode: 0 };
}

export function validateCommand(specs, options = {}) {
  const issues = [];
  const nameMap = {};
  specs.forEach((s) => {
    nameMap[s.name.toLowerCase()] = s;
  });

  // Check broken depends_on and uses
  specs.forEach((spec) => {
    (spec.depends_on || []).forEach((dep) => {
      const target = nameMap[(dep.name || "").toLowerCase()];
      if (!target) {
        issues.push({
          severity: "error",
          type: "broken-dependency",
          spec: spec.name,
          message: `${spec.name} depends on "${dep.name}" which does not exist`,
        });
        return;
      }
      // Check uses against target's feature names
      const targetFeatures = new Set(
        (target.featureFiles || []).map((f) => f.name),
      );
      (dep.uses || []).forEach((useName) => {
        if (!targetFeatures.has(useName)) {
          issues.push({
            severity: "error",
            type: "broken-uses",
            spec: spec.name,
            message: `${spec.name} uses feature "${useName}" from "${target.name}" but it does not exist`,
          });
        }
      });
    });

    // Orphan features dir: declared but no files parsed
    if (spec.features && (spec.featureFiles || []).length === 0) {
      issues.push({
        severity: "error",
        type: "missing-features-dir",
        spec: spec.name,
        message: `${spec.name} declares features path "${spec.features}" but no .feature files were found`,
      });
    }

    // No features at all
    if (!spec.features && (spec.featureFiles || []).length === 0) {
      issues.push({
        severity: "warning",
        type: "no-features",
        spec: spec.name,
        message: `${spec.name} has no features declared`,
      });
    }
  });

  // Cycles
  const { cycles, adj } = analyzeGraph(specs);
  cycles.forEach((scc) => {
    issues.push({
      severity: "error",
      type: "cycle",
      spec: scc.join(", "),
      message: `cycle: ${formatCycle(scc, adj)}`,
    });
  });

  const errors = issues.filter((i) => i.severity === "error");
  const ok = errors.length === 0;
  const exitCode = ok ? 0 : 1;

  if (options.json) {
    return {
      output: JSON.stringify({ ok, issues }, null, 2),
      exitCode,
    };
  }

  if (issues.length === 0) {
    return { output: "ok — no issues found.", exitCode: 0 };
  }

  const lines = [];
  const grouped = { error: [], warning: [] };
  issues.forEach((i) => grouped[i.severity].push(i));

  if (grouped.error.length) {
    lines.push(`${grouped.error.length} error${grouped.error.length === 1 ? "" : "s"}:`);
    grouped.error.forEach((i) => {
      lines.push(`  [${i.type}] ${i.message}`);
    });
  }
  if (grouped.warning.length) {
    if (lines.length) lines.push("");
    lines.push(
      `${grouped.warning.length} warning${grouped.warning.length === 1 ? "" : "s"}:`,
    );
    grouped.warning.forEach((i) => {
      lines.push(`  [${i.type}] ${i.message}`);
    });
  }

  return { output: lines.join("\n"), exitCode };
}

export const COMMAND_HANDLERS = {
  list: listCommand,
  show: showCommand,
  features: featuresCommand,
  deps: depsCommand,
  validate: validateCommand,
};

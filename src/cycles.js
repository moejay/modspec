/**
 * Cycle analysis for modspec dependency graphs.
 *
 * Specs may form cycles (A depends on B, B depends on A). This module
 * detects them via Tarjan's SCC algorithm and computes a cycle-safe depth
 * for graph layout coloring.
 */

/**
 * Build a name -> canonical-name adjacency list from an array of parsed specs.
 * Dep names are matched case-insensitively; unknown deps are silently dropped.
 *
 * @param {Array} specs
 * @returns {{ adj: Object<string, string[]>, nameMap: Object<string, Object> }}
 */
export function buildAdjacency(specs) {
  const nameMap = {};
  specs.forEach((s) => {
    nameMap[s.name.toLowerCase()] = s;
  });

  const adj = {};
  specs.forEach((s) => {
    const targets = [];
    (s.depends_on || []).forEach((dep) => {
      const depName = typeof dep === "string" ? dep : dep && dep.name;
      if (!depName) return;
      const target = nameMap[depName.toLowerCase()];
      if (target) targets.push(target.name);
    });
    adj[s.name] = targets;
  });

  return { adj, nameMap };
}

/**
 * Tarjan's strongly-connected components. Iterative-safe for deep graphs.
 *
 * @param {Object<string, string[]>} adj
 * @param {string[]} nodes
 * @returns {{ sccs: string[][], nodeScc: Object<string, number> }}
 */
export function findSCCs(adj, nodes) {
  let index = 0;
  const stack = [];
  const onStack = {};
  const idx = {};
  const low = {};
  const sccs = [];
  const nodeScc = {};

  function strongconnect(v) {
    // Iterative DFS: frame = { node, childIdx }
    const frames = [{ node: v, childIdx: 0 }];
    idx[v] = index;
    low[v] = index;
    index++;
    stack.push(v);
    onStack[v] = true;

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const node = frame.node;
      const children = adj[node] || [];
      if (frame.childIdx < children.length) {
        const w = children[frame.childIdx++];
        if (idx[w] === undefined) {
          idx[w] = index;
          low[w] = index;
          index++;
          stack.push(w);
          onStack[w] = true;
          frames.push({ node: w, childIdx: 0 });
        } else if (onStack[w]) {
          low[node] = Math.min(low[node], idx[w]);
        }
      } else {
        if (low[node] === idx[node]) {
          const scc = [];
          let w;
          do {
            w = stack.pop();
            delete onStack[w];
            nodeScc[w] = sccs.length;
            scc.push(w);
          } while (w !== node);
          sccs.push(scc);
        }
        frames.pop();
        if (frames.length > 0) {
          const parent = frames[frames.length - 1].node;
          low[parent] = Math.min(low[parent], low[node]);
        }
      }
    }
  }

  nodes.forEach((n) => {
    if (idx[n] === undefined) strongconnect(n);
  });

  return { sccs, nodeScc };
}

/**
 * Analyze a spec graph: find cycles, compute cycle-safe depth, and mark
 * cycle edges. Handles unknown deps gracefully.
 *
 * @param {Array} specs
 * @returns {{
 *   cycles: string[][],               // SCCs that form a real cycle (size > 1 or self-loop)
 *   inCycle: Object<string, boolean>, // node -> is in a cycle
 *   nodeScc: Object<string, number>,  // node -> SCC id
 *   cycleEdges: Array<{source, target}>, // edges that are cycle back-edges
 *   depth: Object<string, number>,    // cycle-safe depth per node
 *   dependentsCount: Object<string, number>,
 * }}
 */
export function analyzeGraph(specs) {
  const { adj } = buildAdjacency(specs);
  const nodes = specs.map((s) => s.name);
  const { sccs, nodeScc } = findSCCs(adj, nodes);

  // An SCC is a "cycle" if it has >1 member OR a single member with a self-loop
  const inCycle = {};
  const cycles = [];
  sccs.forEach((scc, i) => {
    const isCycle =
      scc.length > 1 ||
      (scc.length === 1 && (adj[scc[0]] || []).includes(scc[0]));
    if (isCycle) {
      cycles.push(scc);
      scc.forEach((n) => {
        inCycle[n] = true;
      });
    }
  });

  // Cycle edges = edges whose endpoints share a cycle SCC
  const cycleEdges = [];
  nodes.forEach((src) => {
    (adj[src] || []).forEach((tgt) => {
      if (inCycle[src] && inCycle[tgt] && nodeScc[src] === nodeScc[tgt]) {
        cycleEdges.push({ source: src, target: tgt });
      }
    });
  });

  // Cycle-safe depth on the condensed DAG. We operate per-node but skip any
  // edge that loops back within the same cycle SCC, so depth is always finite.
  const depth = {};
  function calc(name, visiting) {
    if (depth[name] !== undefined) return depth[name];
    if (visiting[name]) return 0; // safety net; cycle edges already filtered
    visiting[name] = true;
    const effective = (adj[name] || []).filter(
      (t) => !(inCycle[name] && inCycle[t] && nodeScc[name] === nodeScc[t]),
    );
    let d;
    if (effective.length === 0) {
      d = 0;
    } else {
      let maxParent = 0;
      for (const t of effective) {
        const td = calc(t, visiting);
        if (td > maxParent) maxParent = td;
      }
      d = maxParent + 1;
    }
    delete visiting[name];
    depth[name] = d;
    return d;
  }
  nodes.forEach((n) => calc(n, {}));

  // Dependents count
  const dependentsCount = {};
  nodes.forEach((n) => {
    dependentsCount[n] = 0;
  });
  nodes.forEach((src) => {
    (adj[src] || []).forEach((tgt) => {
      dependentsCount[tgt] = (dependentsCount[tgt] || 0) + 1;
    });
  });

  return { cycles, inCycle, nodeScc, cycleEdges, depth, dependentsCount, adj };
}

/**
 * Format a cycle SCC as a readable arrow chain (e.g. "a -> b -> c -> a").
 * Walks the adjacency list to produce a real path through the SCC.
 *
 * @param {string[]} scc
 * @param {Object<string, string[]>} adj
 * @returns {string}
 */
export function formatCycle(scc, adj) {
  if (scc.length === 1) {
    // self-loop
    return `${scc[0]} -> ${scc[0]}`;
  }
  const members = new Set(scc);
  const start = scc[0];
  const path = [start];
  const visited = new Set([start]);
  let current = start;
  while (true) {
    const next = (adj[current] || []).find(
      (t) => members.has(t) && (!visited.has(t) || t === start),
    );
    if (!next) break;
    if (next === start) {
      path.push(start);
      break;
    }
    path.push(next);
    visited.add(next);
    current = next;
    if (path.length > scc.length + 1) break; // safety
  }
  return path.join(" -> ");
}

/**
 * Generate a self-contained HTML file with an interactive D3 force-directed
 * dependency graph styled like a neo4j browser.
 *
 * @param {Array} specs - parsed spec objects
 * @param {Object} [options]
 * @param {boolean} [options.liveReload] - include SSE client for dev server mode
 */
export function generateHTML(specs, options = {}) {
  const specsJSON = JSON.stringify(specs, null, 2);
  const { liveReload = false } = options;

  const sseClientScript = liveReload
    ? `
    // SSE live reload
    function connectSSE() {
      const evtSource = new EventSource('/api/events');

      evtSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.specs) {
          updateGraph(data.specs);
        }
      };

      evtSource.onerror = function() {
        evtSource.close();
        // Reconnect after 2 seconds
        setTimeout(connectSSE, 2000);
      };
    }

    function updateGraph(newSpecs) {
      // Preserve current node positions
      const posMap = {};
      if (typeof nodes !== 'undefined') {
        nodes.forEach(n => {
          posMap[n.id] = { x: n.x, y: n.y, vx: n.vx, vy: n.vy };
        });
      }

      // Rebuild data
      const nameSet = new Set(newSpecs.map(s => s.name.toLowerCase()));
      const newNodes = newSpecs.map(s => {
        const pos = posMap[s.name];
        const node = { id: s.name, ...s };
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
          node.vx = pos.vx;
          node.vy = pos.vy;
        }
        return node;
      });

      const newLinks = [];
      newSpecs.forEach(spec => {
        (spec.depends_on || []).forEach(dep => {
          const depName = typeof dep === 'string' ? dep : dep.name;
          const uses = (typeof dep === 'object' && dep.uses) ? dep.uses : [];
          const target = newSpecs.find(s => s.name.toLowerCase() === depName.toLowerCase());
          if (target) {
            newLinks.push({ source: spec.name, target: target.name, uses });
          }
        });
      });

      // Recalculate dependents
      const newDependentsCount = {};
      newNodes.forEach(n => newDependentsCount[n.id] = 0);
      newLinks.forEach(l => {
        const targetId = typeof l.target === 'string' ? l.target : l.target.id;
        newDependentsCount[targetId] = (newDependentsCount[targetId] || 0) + 1;
      });

      // Recalculate depth
      const newDepthMemo = {};
      function newCalcDepth(name) {
        if (newDepthMemo[name] !== undefined) return newDepthMemo[name];
        const spec = newSpecs.find(s => s.name === name);
        if (!spec || !spec.depends_on || spec.depends_on.length === 0) {
          newDepthMemo[name] = 0;
          return 0;
        }
        const maxParent = Math.max(...spec.depends_on.map(d => {
          const depName = typeof d === 'string' ? d : d.name;
          const target = newSpecs.find(s => s.name.toLowerCase() === depName.toLowerCase());
          return target ? newCalcDepth(target.name) : 0;
        }));
        newDepthMemo[name] = maxParent + 1;
        return newDepthMemo[name];
      }
      newNodes.forEach(n => newCalcDepth(n.id));
      const newMaxDepth = Math.max(0, ...Object.values(newDepthMemo));
      colorScale.domain([0, Math.max(newMaxDepth, 1)]);

      // Update global refs
      nodes.length = 0;
      nodes.push(...newNodes);
      links.length = 0;
      links.push(...newLinks);
      Object.assign(dependentsCount, newDependentsCount);
      Object.keys(depthMemo).forEach(k => delete depthMemo[k]);
      Object.assign(depthMemo, newDepthMemo);

      // Update simulation
      simulation.nodes(nodes);
      const linkForce = simulation.force("link");
      if (linkForce) {
        linkForce.links(links);
      } else {
        // Manually resolve string source/target to node objects
        const nodeById = {};
        nodes.forEach(n => nodeById[n.id] = n);
        links.forEach(l => {
          if (typeof l.source === 'string') l.source = nodeById[l.source];
          if (typeof l.target === 'string') l.target = nodeById[l.target];
        });
      }

      // Rebind data
      const linkSel = g.selectAll(".link").data(links, d => (d.source.id || d.source) + '-' + (d.target.id || d.target));
      linkSel.exit().remove();
      linkSel.enter().append("line")
        .attr("class", "link")
        .attr("marker-end", "url(#arrowhead)");

      // Rebind link labels
      const linkLabelSel = g.selectAll(".link-label").data(
        links.filter(l => l.uses && l.uses.length > 0),
        d => (d.source.id || d.source) + '-' + (d.target.id || d.target)
      );
      linkLabelSel.exit().remove();
      linkLabelSel.enter().append("text")
        .attr("class", "link-label")
        .text(d => d.uses.join(', '));

      const nodeSel = g.selectAll(".node").data(nodes, d => d.id);
      nodeSel.exit().remove();
      const nodeEnter = nodeSel.enter().append("g")
        .attr("class", "node")
        .call(d3.drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded));

      nodeEnter.append("circle");
      nodeEnter.append("text");

      nodeEnter.on("click", (event, d) => {
        event.stopPropagation();
        selectNode(d);
      });

      // Update all circles and text
      const allNodes = g.selectAll(".node");
      allNodes.select("circle")
        .attr("r", d => 14 + (dependentsCount[d.id] || 0) * 4)
        .attr("fill", d => colorScale(depthMemo[d.id] || 0))
        .attr("stroke", d => d3.color(colorScale(depthMemo[d.id] || 0)).brighter(0.8));

      allNodes.select("text")
        .attr("dy", d => (14 + (dependentsCount[d.id] || 0) * 4) + 16)
        .text(d => d.name);

      // Update group hulls
      updateGroupHulls();

      // If panel is open, refresh its content without resetting tab or clobbering edits
      if (selectedNode) {
        const updated = nodes.find(n => n.id === selectedNode.id);
        if (updated) {
          selectedNode = updated;
          // Update metadata
          document.getElementById("panel-name").textContent = updated.name;
          document.getElementById("panel-description").textContent = updated.description || "\\u2014";
          document.getElementById("panel-features-path").textContent = updated.features || "\\u2014";
          document.getElementById("panel-group").textContent = updated.group || "\\u2014";
          document.getElementById("panel-tags").textContent = (updated.tags && updated.tags.length > 0) ? updated.tags.join(', ') : "\\u2014";
          renderPanelDeps(updated);
          // Only re-render tab content if not actively editing
          const specEditArea = document.getElementById('spec-edit-area');
          if (!specEditArea) {
            renderSpecBody(updated);
          }
          // Re-render features only if no feature textarea is open
          const anyFeatureEdit = document.querySelector('[id^="feat-area-"]');
          if (!anyFeatureEdit) {
            renderFeatures(updated);
          }
        }
      }

      // Re-apply current layout
      if (currentLayout === 'tree') {
        computeTreePositions();
        simulation.alpha(0.3).restart();
      } else if (currentLayout === 'manual') {
        nodes.forEach(n => { n.fx = n.x; n.fy = n.y; });
        tickUpdate();
      } else {
        simulation.alpha(0.3).restart();
      }
    }

    // Inline editing for spec body
    function startSpecEdit() {
      if (!selectedNode) return;
      const container = document.getElementById('panel-body');
      const body = selectedNode.body || '';
      container.innerHTML = '<textarea id="spec-edit-area" style="width:100%;min-height:300px;background:#0d0d1a;color:#ccc;border:1px solid #0f3460;border-radius:4px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;">' + escapeHtml(body) + '</textarea>' +
        '<div style="margin-top:8px;display:flex;gap:8px;">' +
        '<button onclick="saveSpecBody()" style="background:#e94560;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;">Save</button>' +
        '<button onclick="cancelSpecEdit()" style="background:#333;color:#ccc;border:1px solid #555;padding:6px 16px;border-radius:4px;cursor:pointer;">Cancel</button>' +
        '</div>';
      document.getElementById('spec-edit-btn').style.display = 'none';
    }

    async function saveSpecBody() {
      if (!selectedNode) return;
      const textarea = document.getElementById('spec-edit-area');
      const newBody = textarea.value;
      try {
        const res = await fetch('/api/specs/' + encodeURIComponent(selectedNode.name) + '/body', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: newBody })
        });
        if (!res.ok) throw new Error('Save failed');
        // SSE will push the update
      } catch (err) {
        alert('Error saving: ' + err.message);
      }
    }

    function cancelSpecEdit() {
      if (!selectedNode) return;
      renderSpecBody(selectedNode);
      document.getElementById('spec-edit-btn').style.display = '';
    }

    // Inline editing for feature files
    function startFeatureEdit(specName, filename, content) {
      const containerId = 'feature-edit-' + filename.replace(/[^a-zA-Z0-9]/g, '_');
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '<textarea id="feat-area-' + containerId + '" style="width:100%;min-height:200px;background:#0d0d1a;color:#ccc;border:1px solid #0f3460;border-radius:4px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;">' + escapeHtml(content) + '</textarea>' +
        '<div style="margin-top:8px;display:flex;gap:8px;">' +
        '<button onclick="saveFeatureFile(\\'' + escapeHtml(specName) + '\\', \\'' + escapeHtml(filename) + '\\', \\'' + containerId + '\\')" style="background:#e94560;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;">Save</button>' +
        '<button onclick="cancelFeatureEdit()" style="background:#333;color:#ccc;border:1px solid #555;padding:6px 16px;border-radius:4px;cursor:pointer;">Cancel</button>' +
        '</div>';
    }

    async function saveFeatureFile(specName, filename, containerId) {
      const textarea = document.getElementById('feat-area-' + containerId);
      const newContent = textarea.value;
      try {
        const res = await fetch('/api/features/' + encodeURIComponent(specName) + '/' + encodeURIComponent(filename), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent })
        });
        if (!res.ok) throw new Error('Save failed');
        // SSE will push the update
      } catch (err) {
        alert('Error saving: ' + err.message);
      }
    }

    function cancelFeatureEdit() {
      if (selectedNode) renderFeatures(selectedNode);
    }

    connectSSE();
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>modspec — Dependency Graph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .node circle {
      cursor: grab;
      stroke-width: 2px;
    }

    .node circle:hover {
      stroke: #fff;
      stroke-width: 3px;
    }

    .node text {
      fill: #e0e0e0;
      font-size: 12px;
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
      font-weight: 500;
    }

    .link {
      fill: none;
      stroke: #555;
      stroke-width: 1.5px;
      stroke-opacity: 0.6;
    }

    .link-arrow {
      fill: #555;
      fill-opacity: 0.6;
    }

    .link-label {
      fill: #888;
      font-size: 9px;
      text-anchor: middle;
      pointer-events: none;
      dominant-baseline: central;
    }

    .group-hull {
      fill-opacity: 0.06;
      stroke-opacity: 0.3;
      stroke-width: 1.5px;
      stroke-dasharray: 4 2;
    }

    .group-label {
      font-size: 11px;
      font-weight: 600;
      fill-opacity: 0.5;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      pointer-events: none;
    }

    #info-panel {
      position: fixed;
      top: 0;
      right: -45vw;
      width: 40vw;
      min-width: 320px;
      height: 100vh;
      background: #16213e;
      border-left: 1px solid #0f3460;
      padding: 24px;
      transition: right 0.3s ease;
      overflow-y: auto;
      z-index: 10;
      display: flex;
      flex-direction: column;
    }

    #info-panel.open {
      right: 0;
    }

    #info-panel h2 {
      color: #e94560;
      margin-bottom: 12px;
      font-size: 20px;
    }

    #info-panel .field {
      margin-bottom: 16px;
    }

    #info-panel .field label {
      display: block;
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }

    #info-panel .field .value {
      color: #e0e0e0;
      font-size: 14px;
      line-height: 1.5;
    }

    #info-panel .dep-tag {
      display: inline-block;
      background: #0f3460;
      color: #53a8b6;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin: 2px 4px 2px 0;
    }

    #info-panel .uses-tag {
      display: inline-block;
      background: rgba(233, 69, 96, 0.15);
      color: #e94560;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      margin: 1px 2px;
    }

    #info-panel .group-tag {
      display: inline-block;
      background: rgba(83, 168, 182, 0.15);
      color: #53a8b6;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    #info-panel .tag-pill {
      display: inline-block;
      background: #0d0d1a;
      color: #888;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      margin: 2px 4px 2px 0;
      border: 1px solid #333;
    }

    #info-panel .close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      background: none;
      border: none;
      color: #888;
      font-size: 20px;
      cursor: pointer;
    }

    #info-panel .close-btn:hover {
      color: #e0e0e0;
    }

    #panel-meta {
      flex-shrink: 0;
    }

    /* Tab styling */
    .panel-tabs {
      display: flex;
      border-bottom: 1px solid #0f3460;
      margin-bottom: 12px;
      flex-shrink: 0;
    }

    .panel-tab {
      padding: 8px 16px;
      cursor: pointer;
      color: #666;
      font-size: 13px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: color 0.2s, border-bottom-color 0.2s;
      background: none;
      border-top: none;
      border-left: none;
      border-right: none;
    }

    .panel-tab:hover {
      color: #aaa;
    }

    .panel-tab.active {
      color: #e94560;
      border-bottom: 2px solid #e94560;
    }

    .panel-tab-content {
      flex: 1;
      overflow-y: auto;
    }

    #panel-spec-tab {
      display: block;
    }

    #panel-features-tab {
      display: none;
    }

    /* Spec tab body area */
    #panel-body {
      flex: 1;
      overflow-y: auto;
      border-top: 1px solid #0f3460;
      padding-top: 16px;
      margin-top: 8px;
    }

    .spec-edit-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 4px;
    }

    .edit-btn {
      background: none;
      border: 1px solid #555;
      color: #888;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }

    .edit-btn:hover {
      color: #e0e0e0;
      border-color: #888;
    }

    /* Markdown rendered content styles */
    #panel-body h1, #panel-body h2, #panel-body h3,
    #panel-body h4, #panel-body h5, #panel-body h6 {
      color: #e0e0e0;
      margin: 16px 0 8px 0;
    }

    #panel-body h1 { font-size: 1.4em; }
    #panel-body h2 { font-size: 1.2em; }
    #panel-body h3 { font-size: 1.1em; }

    #panel-body p {
      color: #ccc;
      line-height: 1.6;
      margin-bottom: 12px;
    }

    #panel-body code {
      background: #0d0d1a;
      color: #53a8b6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: "Fira Code", "Consolas", monospace;
      font-size: 0.9em;
    }

    #panel-body pre {
      background: #0d0d1a;
      border: 1px solid #1a1a3e;
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      margin-bottom: 12px;
    }

    #panel-body pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      color: #ccc;
    }

    #panel-body ul, #panel-body ol {
      color: #ccc;
      margin: 8px 0 12px 20px;
      line-height: 1.6;
    }

    #panel-body li {
      margin-bottom: 4px;
    }

    #panel-body a {
      color: #53a8b6;
      text-decoration: none;
    }

    #panel-body a:hover {
      text-decoration: underline;
    }

    #panel-body blockquote {
      border-left: 3px solid #0f3460;
      padding-left: 12px;
      color: #999;
      margin: 8px 0;
    }

    #panel-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }

    #panel-body th, #panel-body td {
      border: 1px solid #0f3460;
      padding: 8px;
      text-align: left;
      color: #ccc;
    }

    #panel-body th {
      background: #0d0d1a;
      color: #e0e0e0;
    }

    #panel-body tr:nth-child(even) {
      background: rgba(15, 52, 96, 0.3);
    }

    /* Features tab styles */
    .feature-section {
      margin-bottom: 16px;
    }

    .feature-header {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 6px 0;
    }

    .feature-header h3 {
      color: #e94560;
      font-size: 14px;
      margin: 0;
    }

    .feature-header .feature-filename {
      color: #666;
      font-size: 11px;
    }

    .feature-header .feature-toggle {
      color: #666;
      font-size: 10px;
      transition: transform 0.2s;
    }

    .feature-header .feature-toggle.expanded {
      transform: rotate(90deg);
    }

    .feature-scenarios {
      display: none;
      padding-left: 16px;
      margin-top: 4px;
    }

    .feature-scenarios.expanded {
      display: block;
    }

    .scenario-list {
      list-style: none;
      padding-left: 0;
    }

    .scenario-item {
      margin-bottom: 8px;
    }

    .scenario-item strong {
      color: #ccc;
      font-size: 13px;
    }

    .scenario-steps {
      list-style: none;
      padding-left: 16px;
      margin-top: 4px;
    }

    .scenario-steps li {
      color: #999;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 1px;
      font-family: monospace;
    }

    .no-features-msg {
      color: #666;
      font-style: italic;
      font-size: 13px;
    }

    .title-bar {
      position: fixed;
      top: 16px;
      left: 20px;
      z-index: 5;
      font-size: 14px;
      color: #555;
      letter-spacing: 1px;
    }

    .title-bar span {
      color: #e94560;
    }

    .layout-toolbar {
      position: fixed;
      top: 44px;
      left: 20px;
      z-index: 5;
      display: flex;
      gap: 4px;
    }

    .layout-btn {
      background: #16213e;
      border: 1px solid #0f3460;
      color: #888;
      padding: 4px 12px;
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
      font-family: inherit;
      transition: color 0.2s, border-color 0.2s;
    }

    .layout-btn:hover {
      color: #ccc;
      border-color: #555;
    }

    .layout-btn.active {
      color: #e94560;
      border-color: #e94560;
    }

    .node.selected circle {
      stroke: #e94560;
      stroke-width: 3px;
    }
  </style>
</head>
<body>
  <div class="title-bar"><span>modspec</span> dependency graph</div>
  <div class="layout-toolbar">
    <button class="layout-btn active" id="layout-force" onclick="setLayout('force')">Force</button>
    <button class="layout-btn" id="layout-tree" onclick="setLayout('tree')">Tree</button>
    <button class="layout-btn" id="layout-manual" onclick="setLayout('manual')">Manual</button>
    <span style="width:1px;height:20px;background:#0f3460;margin:0 8px;"></span>
    <button class="layout-btn" id="toggle-edge-labels" onclick="toggleEdgeLabels()">Edge Labels</button>
  </div>
  <svg id="graph"></svg>
  <div id="info-panel">
    <button class="close-btn" onclick="closePanel()">&times;</button>
    <div id="panel-meta">
      <h2 id="panel-name"></h2>
      <div class="field">
        <label>Description</label>
        <div class="value" id="panel-description"></div>
      </div>
      <div class="field">
        <label>Group</label>
        <div class="value" id="panel-group"></div>
      </div>
      <div class="field">
        <label>Tags</label>
        <div class="value" id="panel-tags"></div>
      </div>
      <div class="field">
        <label>Dependencies</label>
        <div class="value" id="panel-deps"></div>
      </div>
      <div class="field">
        <label>Features Path</label>
        <div class="value" id="panel-features-path"></div>
      </div>
    </div>
    <div class="panel-tabs">
      <button class="panel-tab active" id="panel-tab-spec" onclick="switchTab('spec')">Spec</button>
      <button class="panel-tab" id="panel-tab-features" onclick="switchTab('features')">Features</button>
    </div>
    <div id="panel-spec-tab" class="panel-tab-content">
      <div class="spec-edit-header">
        <button class="edit-btn" id="spec-edit-btn" onclick="startSpecEdit()">Edit</button>
      </div>
      <div id="panel-body"></div>
    </div>
    <div id="panel-features-tab" class="panel-tab-content">
      <div id="panel-features-content"></div>
    </div>
  </div>

  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    const specs = ${specsJSON};
    let selectedNode = null;

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Tab switching
    function switchTab(tab) {
      const specTab = document.getElementById('panel-spec-tab');
      const featuresTab = document.getElementById('panel-features-tab');
      const specBtn = document.getElementById('panel-tab-spec');
      const featuresBtn = document.getElementById('panel-tab-features');

      if (tab === 'spec') {
        specTab.style.display = 'block';
        featuresTab.style.display = 'none';
        specBtn.classList.add('active');
        featuresBtn.classList.remove('active');
      } else {
        specTab.style.display = 'none';
        featuresTab.style.display = 'block';
        specBtn.classList.remove('active');
        featuresBtn.classList.add('active');
      }
    }

    // Render panel dependencies with uses tags
    function renderPanelDeps(d) {
      const depsContainer = document.getElementById("panel-deps");
      if (!d.depends_on || d.depends_on.length === 0) {
        depsContainer.textContent = "None (root node)";
        return;
      }
      let html = '';
      d.depends_on.forEach(dep => {
        const depName = typeof dep === 'string' ? dep : dep.name;
        const uses = (typeof dep === 'object' && dep.uses) ? dep.uses : [];
        html += '<div style="margin-bottom:6px;">';
        html += '<span class="dep-tag">' + escapeHtml(depName) + '</span>';
        if (uses.length > 0) {
          html += '<br>';
          uses.forEach(u => {
            html += '<span class="uses-tag">' + escapeHtml(u) + '</span>';
          });
        }
        html += '</div>';
      });
      depsContainer.innerHTML = html;
    }

    // Render features tab content
    function renderFeatures(d) {
      const container = document.getElementById('panel-features-content');
      const featureFiles = d.featureFiles || [];

      if (featureFiles.length === 0) {
        container.innerHTML = '<p class="no-features-msg">No feature files found</p>';
        return;
      }

      let html = '';
      featureFiles.forEach((f, idx) => {
        const safeId = f.filename.replace(/[^a-zA-Z0-9]/g, '_');
        html += '<div class="feature-section">';
        html += '<div class="feature-header" onclick="toggleFeature(\\'feat-' + idx + '\\')">';
        html += '<span class="feature-toggle" id="toggle-feat-' + idx + '">&#9654;</span>';
        html += '<h3>' + escapeHtml(f.name) + '</h3>';
        html += '<span class="feature-filename">' + escapeHtml(f.filename) + '</span>';
        ${liveReload ? `html += '<button class="edit-btn" style="margin-left:auto;" onclick="event.stopPropagation(); startFeatureEdit(\\'' + escapeHtml(d.name) + '\\', \\'' + escapeHtml(f.filename) + '\\', \\'' + escapeHtml(f.content).replace(/\\n/g, '\\\\n').replace(/'/g, "\\\\'") + '\\')">Edit</button>';` : ''}
        html += '</div>';
        html += '<div class="feature-scenarios" id="feat-' + idx + '">';
        html += '<ul class="scenario-list">';
        (f.scenarios || []).forEach(s => {
          const scenario = typeof s === 'string' ? { name: s, steps: [] } : s;
          html += '<li class="scenario-item">';
          html += '<strong>' + escapeHtml(scenario.name) + '</strong>';
          if (scenario.steps && scenario.steps.length > 0) {
            html += '<ul class="scenario-steps">';
            scenario.steps.forEach(step => {
              html += '<li>' + escapeHtml(step) + '</li>';
            });
            html += '</ul>';
          }
          html += '</li>';
        });
        html += '</ul>';
        html += '<div id="feature-edit-' + safeId + '"></div>';
        html += '</div>';
        html += '</div>';
      });

      container.innerHTML = html;
    }

    function toggleFeature(id) {
      const el = document.getElementById(id);
      const toggle = document.getElementById('toggle-' + id);
      if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
        if (toggle) toggle.classList.remove('expanded');
      } else {
        el.classList.add('expanded');
        if (toggle) toggle.classList.add('expanded');
      }
    }

    // Render spec body (markdown preview)
    function renderSpecBody(d) {
      const bodyContainer = document.getElementById('panel-body');
      if (d.body && d.body.trim()) {
        bodyContainer.innerHTML = typeof marked !== 'undefined'
          ? marked.parse(d.body)
          : '<pre>' + escapeHtml(d.body) + '</pre>';
      } else {
        bodyContainer.innerHTML = '<p style="color: #666;">No content</p>';
      }
    }

    // Build nodes and links
    const nameSet = new Set(specs.map(s => s.name.toLowerCase()));
    const nodes = specs.map(s => ({ id: s.name, ...s }));
    const links = [];

    specs.forEach(spec => {
      (spec.depends_on || []).forEach(dep => {
        const depName = typeof dep === 'string' ? dep : dep.name;
        const uses = (typeof dep === 'object' && dep.uses) ? dep.uses : [];
        const target = specs.find(s => s.name.toLowerCase() === depName.toLowerCase());
        if (target) {
          links.push({ source: spec.name, target: target.name, uses });
        }
      });
    });

    // Calculate dependents count for node sizing
    const dependentsCount = {};
    nodes.forEach(n => dependentsCount[n.id] = 0);
    links.forEach(l => {
      const targetId = typeof l.target === 'string' ? l.target : l.target.id;
      dependentsCount[targetId] = (dependentsCount[targetId] || 0) + 1;
    });

    // Calculate depth for coloring
    function calcDepth(name, memo = {}) {
      if (memo[name] !== undefined) return memo[name];
      const spec = specs.find(s => s.name === name);
      if (!spec || !spec.depends_on || spec.depends_on.length === 0) {
        memo[name] = 0;
        return 0;
      }
      const maxParent = Math.max(...spec.depends_on.map(d => {
        const depName = typeof d === 'string' ? d : d.name;
        const target = specs.find(s => s.name.toLowerCase() === depName.toLowerCase());
        return target ? calcDepth(target.name, memo) : 0;
      }));
      memo[name] = maxParent + 1;
      return memo[name];
    }

    const depthMemo = {};
    nodes.forEach(n => calcDepth(n.id, depthMemo));
    const maxDepth = Math.max(0, ...Object.values(depthMemo));

    const colorScale = d3.scaleSequential(d3.interpolateCool)
      .domain([0, Math.max(maxDepth, 1)]);

    // Group colors
    const groups = [...new Set(specs.map(s => s.group).filter(Boolean))];
    const groupColorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

    // SVG setup
    const svg = d3.select("#graph");
    const width = window.innerWidth;
    const height = window.innerHeight;

    const g = svg.append("g");

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("class", "link-arrow");

    // Group hulls layer (drawn behind everything)
    const hullGroup = g.append("g").attr("class", "hulls");
    const hullLabelGroup = g.append("g").attr("class", "hull-labels");

    // Layout state
    let currentLayout = 'force';

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    // Draw links
    const link = g.selectAll(".link")
      .data(links)
      .join("line")
      .attr("class", "link")
      .attr("marker-end", "url(#arrowhead)");

    // Draw link labels (feature uses) — hidden by default
    let showEdgeLabels = false;
    const linkLabel = g.selectAll(".link-label")
      .data(links.filter(l => l.uses && l.uses.length > 0))
      .join("text")
      .attr("class", "link-label")
      .attr("display", "none")
      .text(d => d.uses.join(', '));

    function toggleEdgeLabels() {
      showEdgeLabels = !showEdgeLabels;
      g.selectAll(".link-label").attr("display", showEdgeLabels ? null : "none");
      document.getElementById("toggle-edge-labels").classList.toggle("active", showEdgeLabels);
    }

    // Draw nodes
    const node = g.selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded));

    node.append("circle")
      .attr("r", d => 14 + (dependentsCount[d.id] || 0) * 4)
      .attr("fill", d => colorScale(depthMemo[d.id] || 0))
      .attr("stroke", d => d3.color(colorScale(depthMemo[d.id] || 0)).brighter(0.8));

    node.append("text")
      .attr("dy", d => (14 + (dependentsCount[d.id] || 0) * 4) + 16)
      .text(d => d.name);

    // Click to select
    node.on("click", (event, d) => {
      event.stopPropagation();
      selectNode(d);
    });

    svg.on("click", () => closePanel());

    function selectNode(d) {
      selectedNode = d;
      node.classed("selected", n => n.id === d.id);
      document.getElementById("panel-name").textContent = d.name;
      document.getElementById("panel-description").textContent = d.description || "\\u2014";
      document.getElementById("panel-features-path").textContent = d.features || "\\u2014";
      document.getElementById("panel-group").textContent = d.group || "\\u2014";

      const tagsContainer = document.getElementById("panel-tags");
      if (d.tags && d.tags.length > 0) {
        tagsContainer.innerHTML = d.tags.map(t => '<span class="tag-pill">' + escapeHtml(t) + '</span>').join('');
      } else {
        tagsContainer.textContent = "\\u2014";
      }

      renderPanelDeps(d);

      // Render spec body
      renderSpecBody(d);
      document.getElementById('spec-edit-btn').style.display = '';

      // Render features
      renderFeatures(d);

      // Only reset to spec tab if panel is not already open
      const panel = document.getElementById("info-panel");
      if (!panel.classList.contains("open")) {
        switchTab('spec');
      }

      panel.classList.add("open");
    }

    function closePanel() {
      document.getElementById("info-panel").classList.remove("open");
      node.classed("selected", false);
      selectedNode = null;
    }

    // Group hull rendering
    function updateGroupHulls() {
      const groupMap = {};
      nodes.forEach(n => {
        if (n.group) {
          if (!groupMap[n.group]) groupMap[n.group] = [];
          groupMap[n.group].push(n);
        }
      });

      const hullData = Object.entries(groupMap)
        .filter(([, members]) => members.length >= 2)
        .map(([group, members]) => {
          const points = [];
          const pad = 40;
          members.forEach(m => {
            const r = 14 + (dependentsCount[m.id] || 0) * 4 + pad;
            // Add points around each node for a rounder hull
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              points.push([m.x + Math.cos(a) * r, m.y + Math.sin(a) * r]);
            }
          });
          return { group, points, members };
        });

      const hulls = hullGroup.selectAll(".group-hull")
        .data(hullData, d => d.group);

      hulls.exit().remove();

      hulls.enter()
        .append("path")
        .attr("class", "group-hull")
        .merge(hulls)
        .attr("d", d => {
          const hull = d3.polygonHull(d.points);
          return hull ? "M" + hull.join("L") + "Z" : "";
        })
        .attr("fill", d => groupColorScale(d.group))
        .attr("stroke", d => groupColorScale(d.group));

      // Group labels
      const labels = hullLabelGroup.selectAll(".group-label")
        .data(hullData, d => d.group);

      labels.exit().remove();

      labels.enter()
        .append("text")
        .attr("class", "group-label")
        .merge(labels)
        .text(d => d.group)
        .attr("x", d => {
          const xs = d.members.map(m => m.x);
          return (Math.min(...xs) + Math.max(...xs)) / 2;
        })
        .attr("y", d => {
          const ys = d.members.map(m => m.y);
          return Math.min(...ys) - 50;
        })
        .attr("text-anchor", "middle")
        .attr("fill", d => groupColorScale(d.group));
    }

    // Simulation tick — updates positions for links, labels, nodes, and hulls
    function tickUpdate() {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      linkLabel
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2 - 6);

      node.attr("transform", d => "translate(" + d.x + "," + d.y + ")");

      updateGroupHulls();
    }

    simulation.on("tick", tickUpdate);

    // Drag handlers
    function dragStarted(event, d) {
      if (currentLayout === 'force') {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      } else if (currentLayout === 'manual') {
        d.fx = d.x;
        d.fy = d.y;
      }
      // tree: no drag
    }

    function dragged(event, d) {
      if (currentLayout === 'force') {
        d.fx = event.x;
        d.fy = event.y;
      } else if (currentLayout === 'manual') {
        d.x = event.x;
        d.y = event.y;
        d.fx = event.x;
        d.fy = event.y;
        tickUpdate();
      }
    }

    function dragEnded(event, d) {
      if (currentLayout === 'force') {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      // manual: keep fx/fy so node stays put
    }

    // --- Tree layout ---
    // Compute tree positions: roots at top, children below
    function computeTreePositions() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Group nodes by depth
      const byDepth = {};
      let maxD = 0;
      nodes.forEach(n => {
        const d = depthMemo[n.id] || 0;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(n);
        if (d > maxD) maxD = d;
      });

      const levelCount = maxD + 1;
      const yPad = 80;
      const ySpacing = Math.min(140, (h - yPad * 2) / Math.max(levelCount - 1, 1));

      for (let depth = 0; depth <= maxD; depth++) {
        const row = byDepth[depth] || [];
        const xSpacing = w / (row.length + 1);
        row.forEach((n, i) => {
          n.fx = xSpacing * (i + 1);
          n.fy = yPad + depth * ySpacing;
        });
      }
    }

    // --- Layout switching ---
    function setLayout(layout) {
      currentLayout = layout;
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('layout-' + layout).classList.add('active');

      if (layout === 'force') {
        // Release all fixed positions, restart simulation
        nodes.forEach(n => { n.fx = null; n.fy = null; });
        simulation.force("link", d3.forceLink(links).id(d => d.id).distance(120));
        simulation.force("charge", d3.forceManyBody().strength(-400));
        simulation.force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));
        simulation.force("collision", d3.forceCollide().radius(40));
        simulation.alpha(1).restart();
      } else if (layout === 'tree') {
        // Stop simulation forces, pin nodes to tree positions
        simulation.force("link", null);
        simulation.force("charge", null);
        simulation.force("center", null);
        simulation.force("collision", null);
        computeTreePositions();
        simulation.alpha(0.5).restart();
      } else if (layout === 'manual') {
        // Stop simulation entirely, keep nodes where they are
        simulation.force("link", null);
        simulation.force("charge", null);
        simulation.force("center", null);
        simulation.force("collision", null);
        simulation.stop();
        // Pin all nodes at current positions
        nodes.forEach(n => {
          n.fx = n.x;
          n.fy = n.y;
        });
      }
    }

    // Handle window resize
    window.addEventListener("resize", () => {
      if (currentLayout === 'force') {
        simulation.force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));
        simulation.alpha(0.3).restart();
      } else if (currentLayout === 'tree') {
        computeTreePositions();
        simulation.alpha(0.3).restart();
      }
    });

    // Non-live-reload stubs for edit functions
    function startSpecEdit() {}

    ${sseClientScript}
  </script>
</body>
</html>`;
}

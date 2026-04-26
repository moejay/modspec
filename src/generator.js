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

      // Rebuild data via cycle-aware analyzer
      const analysis = analyzeGraphData(newSpecs);
      const newNodes = newSpecs.map(s => {
        const pos = posMap[s.name];
        const node = { id: s.name, ...s, inCycle: !!analysis.inCycle[s.name] };
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
          node.vx = pos.vx;
          node.vy = pos.vy;
        }
        return node;
      });

      const newLinks = analysis.links;
      const newDependentsCount = analysis.dependentsCount;
      const newDepthMemo = analysis.depth;
      const newMaxDepth = Math.max(0, ...Object.values(newDepthMemo));
      colorScale.domain([0, Math.max(newMaxDepth, 1)]);

      // Update cycle state
      graphInCycle = { ...analysis.inCycle };
      graphCycles = analysis.cycles.slice();
      updateCycleBadge();

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
        .merge(linkSel)
        .attr("class", d => "link" + (d.cycle ? " cycle" : ""))
        .attr("marker-end", d => d.cycle ? "url(#arrowhead-cycle)" : "url(#arrowhead)");

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
      allNodes.classed("cycle", d => !!d.inCycle);
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
      } else if (currentLayout === 'groups') {
        computeGroupsPositions();
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

    // AI Panel state
    let aiSessionId = null;
    let aiStreaming = false;
    let aiAbortController = null;
    let lastExtractedSpec = null;

    const AI_SETTINGS_KEY = 'modspec-ai-settings';
    const AI_SETTINGS_DEFAULTS = {
      permissionMode: '',
      allowedTools: ['Edit', 'Read', 'Write', 'Glob', 'Grep'],
      customTools: '',
      customArgs: '',
      dangerouslySkipPermissions: false,
    };

    function loadAISettings() {
      try {
        const stored = localStorage.getItem(AI_SETTINGS_KEY);
        if (stored) return { ...AI_SETTINGS_DEFAULTS, ...JSON.parse(stored) };
      } catch {}
      return { ...AI_SETTINGS_DEFAULTS };
    }

    function saveAISettings() {
      const settings = {
        permissionMode: document.getElementById('ai-setting-permission-mode').value,
        allowedTools: Array.from(document.querySelectorAll('.ai-tool-checkbox input:checked')).map(cb => cb.dataset.tool),
        customTools: document.getElementById('ai-setting-custom-tools').value.trim(),
        customArgs: document.getElementById('ai-setting-custom-args').value.trim(),
        dangerouslySkipPermissions: document.getElementById('ai-setting-skip-permissions').checked,
      };
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
    }

    function applySettingsToForm(settings) {
      document.getElementById('ai-setting-permission-mode').value = settings.permissionMode || '';
      document.querySelectorAll('.ai-tool-checkbox input').forEach(cb => {
        cb.checked = settings.allowedTools.includes(cb.dataset.tool);
      });
      document.getElementById('ai-setting-custom-tools').value = settings.customTools || '';
      document.getElementById('ai-setting-custom-args').value = settings.customArgs || '';
      document.getElementById('ai-setting-skip-permissions').checked = settings.dangerouslySkipPermissions || false;
    }

    function getAISettings() {
      const s = loadAISettings();
      // Merge checkbox tools with custom tool patterns
      const allTools = [...s.allowedTools];
      if (s.customTools) {
        s.customTools.split(/[,\\s]+/).filter(Boolean).forEach(t => {
          if (!allTools.includes(t)) allTools.push(t);
        });
      }
      return {
        permissionMode: s.permissionMode || undefined,
        allowedTools: allTools.length > 0 ? allTools : undefined,
        customArgs: s.customArgs || undefined,
        dangerouslySkipPermissions: s.dangerouslySkipPermissions || undefined,
      };
    }

    function toggleSettingsPanel() {
      const panel = document.getElementById('ai-settings-panel');
      const chat = document.getElementById('ai-chat-messages');
      const preview = document.getElementById('ai-spec-preview');
      const inputArea = document.querySelector('.ai-input-area');
      const btn = document.getElementById('ai-gear-btn');
      const isVisible = panel.classList.contains('visible');
      if (isVisible) {
        panel.classList.remove('visible');
        chat.style.display = '';
        preview.style.display = '';
        inputArea.style.display = '';
        btn.classList.remove('active');
      } else {
        applySettingsToForm(loadAISettings());
        panel.classList.add('visible');
        chat.style.display = 'none';
        preview.style.display = 'none';
        inputArea.style.display = 'none';
        btn.classList.add('active');
      }
    }

    // Initialize settings form on load
    (function initSettings() {
      applySettingsToForm(loadAISettings());
    })();

    function toggleAIPanel() {
      const panel = document.getElementById('ai-panel');
      const btn = document.getElementById('new-spec-btn');
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        btn.classList.remove('active');
      } else {
        panel.classList.add('open');
        btn.classList.add('active');
        if (!aiSessionId) newAISession();
        document.getElementById('ai-input').focus();
      }
    }

    function closeAIPanel() {
      document.getElementById('ai-panel').classList.remove('open');
      document.getElementById('new-spec-btn').classList.remove('active');
    }

    function newAISession() {
      aiSessionId = null;
      document.getElementById('ai-chat-messages').innerHTML = '';
      hideSpecPreview();
      lastExtractedSpec = null;
    }

    function hideSpecPreview() {
      document.getElementById('ai-spec-preview').classList.remove('visible');
    }

    function addChatMessage(role, content) {
      const container = document.getElementById('ai-chat-messages');
      const div = document.createElement('div');
      div.className = 'ai-message ' + (role === 'user' ? 'ai-user-msg' : role === 'error' ? 'ai-error-msg' : 'ai-assistant-msg');
      if (role === 'assistant') {
        div.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : '<pre>' + escapeHtml(content) + '</pre>';
      } else {
        div.textContent = content;
      }
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      return div;
    }

    function handleAIInputKey(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendAIMessage();
      }
    }

    async function sendAIMessage() {
      if (aiStreaming) return;
      const input = document.getElementById('ai-input');
      const message = input.value.trim();
      if (!message) return;

      input.value = '';
      input.style.height = 'auto';
      addChatMessage('user', message);

      const sendBtn = document.getElementById('ai-send-btn');
      sendBtn.textContent = 'Stop';
      sendBtn.onclick = stopAIStream;
      aiStreaming = true;

      // Create assistant message bubble for streaming
      const container = document.getElementById('ai-chat-messages');
      const assistantDiv = document.createElement('div');
      assistantDiv.className = 'ai-message ai-assistant-msg ai-streaming-cursor';
      assistantDiv.textContent = '';
      container.appendChild(assistantDiv);
      container.scrollTop = container.scrollHeight;

      let fullText = '';

      try {
        aiAbortController = new AbortController();
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionId: aiSessionId, settings: getAISettings() }),
          signal: aiAbortController.signal,
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\\n');
          sseBuffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);
            try {
              const evt = JSON.parse(jsonStr);
              if (evt.type === 'assistant' && evt.message && evt.message.content) {
                // Extract text from content blocks
                const textContent = evt.message.content
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .join('');
                if (textContent) {
                  fullText = textContent;
                  assistantDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : '<pre>' + escapeHtml(fullText) + '</pre>';
                  container.scrollTop = container.scrollHeight;
                }
              } else if (evt.type === 'system' && evt.session_id) {
                // Capture the actual session ID from Claude for resume
                aiSessionId = evt.session_id;
              } else if (evt.type === 'result' && evt.result) {
                fullText = evt.result;
              } else if (evt.type === 'error') {
                addChatMessage('error', evt.message || 'An error occurred');
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          addChatMessage('error', 'Connection error: ' + err.message);
        }
      }

      // Finalize the assistant message
      assistantDiv.classList.remove('ai-streaming-cursor');
      if (fullText) {
        assistantDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : '<pre>' + escapeHtml(fullText) + '</pre>';
      }

      // Try to extract a spec from the response
      extractSpecFromResponse(fullText);

      aiStreaming = false;
      aiAbortController = null;
      sendBtn.textContent = 'Send';
      sendBtn.onclick = sendAIMessage;
      container.scrollTop = container.scrollHeight;
    }

    function stopAIStream() {
      if (aiAbortController) {
        aiAbortController.abort();
      }
      fetch('/api/ai/stop', { method: 'POST' }).catch(() => {});
    }

    function extractSpecFromResponse(text) {
      if (!text) return;
      // Match markdown code fence containing YAML frontmatter
      const fenceRegex = /\`\`\`(?:markdown|md|yaml)?\\n(---\\n[\\s\\S]*?\\n---\\n[\\s\\S]*?)\`\`\`/;
      const match = text.match(fenceRegex);
      if (!match) return;

      const specContent = match[1];

      // Parse the frontmatter to validate
      const fmMatch = specContent.match(/^---\\n([\\s\\S]*?)\\n---\\n([\\s\\S]*)$/);
      if (!fmMatch) return;

      try {
        // Simple YAML name extraction for validation
        const yamlStr = fmMatch[1];
        const nameMatch = yamlStr.match(/^name:\\s*(.+)$/m);
        if (!nameMatch) return;

        lastExtractedSpec = specContent;
        const preview = document.getElementById('ai-preview-content');
        preview.textContent = specContent;
        document.getElementById('ai-spec-preview').classList.add('visible');
      } catch {
        // ignore parse errors
      }
    }

    async function saveExtractedSpec() {
      if (!lastExtractedSpec) return;

      // Parse frontmatter from the extracted spec
      const fmMatch = lastExtractedSpec.match(/^---\\n([\\s\\S]*?)\\n---\\n([\\s\\S]*)$/);
      if (!fmMatch) {
        addChatMessage('error', 'Could not parse spec content');
        return;
      }

      const yamlStr = fmMatch[1];
      const body = fmMatch[2].trim();

      // Extract fields from YAML (simple line-by-line parsing)
      const fields = {};
      let currentKey = null;
      let arrayValues = [];
      let inArray = false;

      for (const line of yamlStr.split('\\n')) {
        const keyMatch = line.match(/^(\\w[\\w_]*):\\s*(.*)$/);
        if (keyMatch) {
          if (inArray && currentKey) {
            fields[currentKey] = arrayValues;
            arrayValues = [];
            inArray = false;
          }
          currentKey = keyMatch[1];
          const val = keyMatch[2].trim();
          if (val === '' || val === '[]') {
            // Could be start of array
          } else if (val.startsWith('[') && val.endsWith(']')) {
            fields[currentKey] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          } else {
            fields[currentKey] = val.replace(/^["']|["']$/g, '');
          }
        } else if (line.match(/^\\s+-\\s+/)) {
          inArray = true;
          const item = line.replace(/^\\s+-\\s+/, '').trim();
          // Could be a simple string or a name: value
          const nameVal = item.match(/^name:\\s*(.+)$/);
          if (nameVal) {
            arrayValues.push({ name: nameVal[1].trim().replace(/^["']|["']$/g, ''), uses: [] });
          } else {
            arrayValues.push(item.replace(/^["']|["']$/g, ''));
          }
        } else if (line.match(/^\\s+uses:/) && arrayValues.length > 0) {
          // uses field for depends_on object
          const usesMatch = line.match(/uses:\\s*\\[(.*)\\]/);
          if (usesMatch && typeof arrayValues[arrayValues.length - 1] === 'object') {
            arrayValues[arrayValues.length - 1].uses = usesMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          }
        }
      }
      if (inArray && currentKey) {
        fields[currentKey] = arrayValues;
      }

      if (!fields.name) {
        addChatMessage('error', 'Spec must have a name field in frontmatter');
        return;
      }

      try {
        const res = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fields.name,
            description: fields.description || '',
            group: fields.group || '',
            tags: Array.isArray(fields.tags) ? fields.tags : [],
            depends_on: Array.isArray(fields.depends_on) ? fields.depends_on : [],
            body: body,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          addChatMessage('error', 'Failed to save: ' + (data.error || 'Unknown error'));
          return;
        }

        addChatMessage('assistant', '**Spec "' + escapeHtml(fields.name) + '" created successfully!** It should appear in the graph shortly.');
        hideSpecPreview();
        lastExtractedSpec = null;
      } catch (err) {
        addChatMessage('error', 'Error saving spec: ' + err.message);
      }
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
      stroke: #7a7a9a;
      stroke-width: 1.75px;
      stroke-opacity: 0.85;
    }

    .link.cycle {
      stroke: #e94560;
      stroke-width: 2.25px;
      stroke-opacity: 0.95;
      stroke-dasharray: 5 3;
    }

    .link-arrow {
      fill: #b8b8d4;
      fill-opacity: 1;
    }

    .link-arrow.cycle {
      fill: #e94560;
      fill-opacity: 1;
    }

    .node.cycle circle {
      stroke: #e94560;
      stroke-width: 3px;
      stroke-dasharray: 3 2;
    }

    .cycle-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 1px 8px;
      background: rgba(233, 69, 96, 0.15);
      color: #e94560;
      border: 1px solid rgba(233, 69, 96, 0.4);
      border-radius: 10px;
      font-size: 11px;
      letter-spacing: 0;
    }

    .dep-tag.cycle {
      background: rgba(233, 69, 96, 0.2);
      color: #e94560;
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

    #ai-panel {
      position: fixed;
      top: 0;
      left: -45vw;
      width: 40vw;
      min-width: 380px;
      height: 100vh;
      background: #16213e;
      border-right: 1px solid #0f3460;
      transition: left 0.3s ease;
      z-index: 10;
      display: flex;
      flex-direction: column;
    }

    #ai-panel.open {
      left: 0;
    }

    .ai-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #0f3460;
      flex-shrink: 0;
    }

    .ai-panel-header h2 {
      color: #e94560;
      font-size: 16px;
      margin: 0;
    }

    .ai-panel-header .ai-header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .ai-header-btn {
      background: #0d0d1a;
      border: 1px solid #0f3460;
      color: #888;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      border-radius: 4px;
      font-family: inherit;
    }

    .ai-header-btn:hover {
      color: #ccc;
      border-color: #555;
    }

    #ai-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ai-message {
      max-width: 90%;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .ai-message pre {
      background: #0d0d1a;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      margin: 8px 0;
    }

    .ai-message code {
      font-family: monospace;
      font-size: 12px;
    }

    .ai-message p { margin: 0 0 8px 0; }
    .ai-message p:last-child { margin-bottom: 0; }

    .ai-user-msg {
      align-self: flex-end;
      background: #0f3460;
      color: #e0e0e0;
    }

    .ai-assistant-msg {
      align-self: flex-start;
      background: #0d0d1a;
      color: #ccc;
      border: 1px solid #1a1a3e;
    }

    .ai-error-msg {
      align-self: flex-start;
      background: #3a1020;
      color: #e94560;
      border: 1px solid #5a1030;
    }

    .ai-streaming-cursor::after {
      content: '\\25AE';
      animation: blink 0.8s step-end infinite;
      color: #e94560;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    .ai-input-area {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid #0f3460;
      flex-shrink: 0;
    }

    #ai-input {
      flex: 1;
      background: #0d0d1a;
      color: #e0e0e0;
      border: 1px solid #0f3460;
      border-radius: 4px;
      padding: 8px 12px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 20px;
      max-height: 120px;
    }

    #ai-input:focus {
      outline: none;
      border-color: #e94560;
    }

    .ai-send-btn {
      background: #e94560;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      white-space: nowrap;
    }

    .ai-send-btn:hover {
      background: #d63a55;
    }

    .ai-send-btn:disabled {
      background: #555;
      cursor: not-allowed;
    }

    .ai-spec-preview {
      border-top: 1px solid #0f3460;
      padding: 12px 20px;
      flex-shrink: 0;
      max-height: 30vh;
      overflow-y: auto;
      display: none;
    }

    .ai-spec-preview.visible {
      display: block;
    }

    .ai-spec-preview h3 {
      color: #e94560;
      font-size: 13px;
      margin: 0 0 8px 0;
    }

    .ai-spec-preview pre {
      background: #0d0d1a;
      color: #ccc;
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      margin: 0 0 8px 0;
      max-height: 15vh;
      overflow-y: auto;
    }

    .ai-spec-preview .ai-preview-actions {
      display: flex;
      gap: 8px;
    }

    #ai-settings-panel {
      display: none;
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    #ai-settings-panel.visible {
      display: block;
    }

    .ai-settings-group {
      margin-bottom: 20px;
    }

    .ai-settings-group label {
      display: block;
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }

    .ai-settings-group select,
    .ai-settings-group input[type="text"] {
      width: 100%;
      background: #0d0d1a;
      color: #e0e0e0;
      border: 1px solid #0f3460;
      border-radius: 4px;
      padding: 6px 10px;
      font-family: inherit;
      font-size: 13px;
    }

    .ai-settings-group select:focus,
    .ai-settings-group input[type="text"]:focus {
      outline: none;
      border-color: #e94560;
    }

    .ai-tool-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin-bottom: 8px;
    }

    .ai-tool-checkbox {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #ccc;
      font-size: 13px;
      cursor: pointer;
    }

    .ai-tool-checkbox input[type="checkbox"] {
      accent-color: #e94560;
      cursor: pointer;
    }

    .ai-danger-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #2a0a15;
      border: 1px solid #5a1030;
      border-radius: 4px;
    }

    .ai-danger-toggle label {
      color: #e94560 !important;
      text-transform: none !important;
      letter-spacing: 0 !important;
      font-size: 13px !important;
      margin-bottom: 0 !important;
      cursor: pointer;
    }

    .ai-danger-toggle input[type="checkbox"] {
      accent-color: #e94560;
      cursor: pointer;
    }

    .ai-danger-warning {
      color: #888;
      font-size: 11px;
      margin-top: 6px;
      line-height: 1.4;
    }

    .ai-settings-footer {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid #0f3460;
      flex-shrink: 0;
    }

    .ai-gear-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .ai-gear-btn:hover {
      color: #e94560;
    }

    .ai-gear-btn.active {
      color: #e94560;
    }
  </style>
</head>
<body>
  <div class="title-bar"><span>modspec</span> dependency graph <span id="cycle-badge" class="cycle-badge" style="display:none;"></span></div>
  <div class="layout-toolbar">
    <button class="layout-btn active" id="layout-force" onclick="setLayout('force')">Force</button>
    <button class="layout-btn" id="layout-tree" onclick="setLayout('tree')">Tree</button>
    <button class="layout-btn" id="layout-groups" onclick="setLayout('groups')">Groups</button>
    <button class="layout-btn" id="layout-manual" onclick="setLayout('manual')">Manual</button>
    <span style="width:1px;height:20px;background:#0f3460;margin:0 8px;"></span>
    <button class="layout-btn" id="toggle-edge-labels" onclick="toggleEdgeLabels()">Edge Labels</button>
${liveReload ? `    <span style="width:1px;height:20px;background:#0f3460;margin:0 8px;"></span>
    <button class="layout-btn" id="new-spec-btn" onclick="toggleAIPanel()">+ New Spec</button>` : ""}
  </div>
  <svg id="graph"></svg>
${liveReload ? `  <div id="ai-panel">
    <div class="ai-panel-header">
      <h2>AI Spec Assistant</h2>
      <div class="ai-header-actions">
        <button class="ai-header-btn" onclick="newAISession()">New Session</button>
        <button class="ai-gear-btn" id="ai-gear-btn" onclick="toggleSettingsPanel()" title="Settings">&#9881;</button>
        <button class="close-btn" onclick="closeAIPanel()">&times;</button>
      </div>
    </div>
    <div id="ai-settings-panel">
      <div class="ai-settings-group">
        <label>Permission Mode</label>
        <select id="ai-setting-permission-mode" onchange="saveAISettings()">
          <option value="">Default (prompt for each tool)</option>
          <option value="acceptEdits">Accept Edits (auto-approve file changes)</option>
          <option value="plan">Plan (confirm before execution)</option>
          <option value="bypassPermissions">Bypass Permissions</option>
        </select>
      </div>
      <div class="ai-settings-group">
        <label>Allowed Tools (auto-approved without prompting)</label>
        <div class="ai-tool-checkboxes">
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Edit" onchange="saveAISettings()" checked> Edit</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Read" onchange="saveAISettings()" checked> Read</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Write" onchange="saveAISettings()" checked> Write</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Glob" onchange="saveAISettings()" checked> Glob</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Grep" onchange="saveAISettings()" checked> Grep</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="Bash" onchange="saveAISettings()"> Bash</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="WebFetch" onchange="saveAISettings()"> WebFetch</label>
          <label class="ai-tool-checkbox"><input type="checkbox" data-tool="WebSearch" onchange="saveAISettings()"> WebSearch</label>
        </div>
        <input type="text" id="ai-setting-custom-tools" placeholder="Additional tool patterns, e.g. Bash(git:*)" onchange="saveAISettings()">
      </div>
      <div class="ai-settings-group">
        <label>Custom CLI Arguments</label>
        <input type="text" id="ai-setting-custom-args" placeholder="e.g. --model sonnet --max-turns 5" onchange="saveAISettings()">
      </div>
      <div class="ai-settings-group">
        <div class="ai-danger-toggle">
          <input type="checkbox" id="ai-setting-skip-permissions" onchange="saveAISettings()">
          <label for="ai-setting-skip-permissions">Dangerously Skip All Permissions</label>
        </div>
        <div class="ai-danger-warning">Bypasses all permission checks. Only use in trusted/sandboxed environments. Overrides allowed tools and permission mode.</div>
      </div>
    </div>
    <div id="ai-chat-messages"></div>
    <div id="ai-spec-preview" class="ai-spec-preview">
      <h3>Spec Preview</h3>
      <pre id="ai-preview-content"></pre>
      <div class="ai-preview-actions">
        <button class="ai-send-btn" onclick="saveExtractedSpec()">Save Spec</button>
        <button class="ai-header-btn" onclick="hideSpecPreview()">Dismiss</button>
      </div>
    </div>
    <div class="ai-input-area">
      <textarea id="ai-input" rows="1" placeholder="Describe the spec you want to create..." onkeydown="handleAIInputKey(event)"></textarea>
      <button class="ai-send-btn" id="ai-send-btn" onclick="sendAIMessage()">Send</button>
    </div>
  </div>` : ""}
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

    // Analyze graph: detects cycles via Tarjan's SCC and computes cycle-safe
    // depth so A<->B cycles don't infinite-loop. Edges within a cycle SCC are
    // marked with { cycle: true } so they can be rendered distinctly.
    function analyzeGraphData(specsArr) {
      const nameMap = {};
      specsArr.forEach(s => { nameMap[s.name.toLowerCase()] = s; });

      const adj = {};
      specsArr.forEach(s => {
        const targets = [];
        (s.depends_on || []).forEach(dep => {
          const depName = typeof dep === 'string' ? dep : (dep && dep.name);
          if (!depName) return;
          const t = nameMap[depName.toLowerCase()];
          if (t) targets.push(t.name);
        });
        adj[s.name] = targets;
      });

      // Tarjan's SCC
      let idx = 0;
      const stack = [];
      const onStack = {};
      const indices = {};
      const low = {};
      const sccs = [];
      const nodeScc = {};

      function strongconnect(v) {
        indices[v] = idx;
        low[v] = idx;
        idx++;
        stack.push(v);
        onStack[v] = true;
        (adj[v] || []).forEach(w => {
          if (indices[w] === undefined) {
            strongconnect(w);
            if (low[w] < low[v]) low[v] = low[w];
          } else if (onStack[w]) {
            if (indices[w] < low[v]) low[v] = indices[w];
          }
        });
        if (low[v] === indices[v]) {
          const scc = [];
          let w;
          do {
            w = stack.pop();
            delete onStack[w];
            nodeScc[w] = sccs.length;
            scc.push(w);
          } while (w !== v);
          sccs.push(scc);
        }
      }
      specsArr.forEach(s => {
        if (indices[s.name] === undefined) strongconnect(s.name);
      });

      const inCycle = {};
      const cycles = [];
      sccs.forEach(scc => {
        const isCycle = scc.length > 1 ||
          (scc.length === 1 && (adj[scc[0]] || []).includes(scc[0]));
        if (isCycle) {
          cycles.push(scc);
          scc.forEach(n => { inCycle[n] = true; });
        }
      });

      function isCycleEdge(a, b) {
        return !!(inCycle[a] && inCycle[b] && nodeScc[a] === nodeScc[b]);
      }

      // Cycle-safe depth (operate on condensed DAG)
      const depth = {};
      function calcD(name, visiting) {
        if (depth[name] !== undefined) return depth[name];
        if (visiting[name]) return 0;
        visiting[name] = true;
        const effective = (adj[name] || []).filter(t => !isCycleEdge(name, t));
        let d = 0;
        if (effective.length > 0) {
          let maxParent = 0;
          effective.forEach(t => {
            const td = calcD(t, visiting);
            if (td > maxParent) maxParent = td;
          });
          d = maxParent + 1;
        }
        delete visiting[name];
        depth[name] = d;
        return d;
      }
      specsArr.forEach(s => calcD(s.name, {}));

      // Build links with cycle flag
      const links = [];
      specsArr.forEach(s => {
        (s.depends_on || []).forEach(dep => {
          const depName = typeof dep === 'string' ? dep : (dep && dep.name);
          const uses = (typeof dep === 'object' && dep.uses) ? dep.uses : [];
          if (!depName) return;
          const target = nameMap[depName.toLowerCase()];
          if (target) {
            links.push({
              source: s.name,
              target: target.name,
              uses,
              cycle: isCycleEdge(s.name, target.name),
            });
          }
        });
      });

      // Dependents count
      const dependentsCount = {};
      specsArr.forEach(s => { dependentsCount[s.name] = 0; });
      Object.keys(adj).forEach(src => {
        adj[src].forEach(tgt => {
          dependentsCount[tgt] = (dependentsCount[tgt] || 0) + 1;
        });
      });

      return { adj, nodeScc, inCycle, cycles, depth, dependentsCount, links };
    }

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
      if (d.inCycle) {
        html += '<div style="margin-bottom:8px;color:#e94560;font-size:11px;">&#9888; This spec is part of a dependency cycle.</div>';
      }
      d.depends_on.forEach(dep => {
        const depName = typeof dep === 'string' ? dep : dep.name;
        const uses = (typeof dep === 'object' && dep.uses) ? dep.uses : [];
        // A dep is "cyclic" from this node's perspective if both ends sit in
        // the same cycle SCC — match via name lookup against graphInCycle.
        const isCyclic = !!(d.inCycle && depName && graphInCycle && graphInCycle[
          (specs.find(s => s.name.toLowerCase() === depName.toLowerCase()) || {}).name
        ]);
        html += '<div style="margin-bottom:6px;">';
        html += '<span class="dep-tag' + (isCyclic ? ' cycle' : '') + '">' + escapeHtml(depName) + (isCyclic ? ' &#8635;' : '') + '</span>';
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

    // Update the cycle badge in the title bar based on current graphCycles state
    function updateCycleBadge() {
      const el = document.getElementById('cycle-badge');
      if (!el) return;
      const n = (graphCycles || []).length;
      if (n === 0) {
        el.style.display = 'none';
        el.textContent = '';
      } else {
        el.style.display = '';
        el.textContent = n + ' cycle' + (n === 1 ? '' : 's');
        el.title = graphCycles.map(scc => scc.join(' -> ') + ' -> ' + scc[0]).join('\\n');
      }
    }

    // Build nodes and links via cycle-aware analyzer
    const initialAnalysis = analyzeGraphData(specs);
    const nodes = specs.map(s => ({ id: s.name, ...s }));
    const links = initialAnalysis.links;
    const dependentsCount = { ...initialAnalysis.dependentsCount };
    const depthMemo = { ...initialAnalysis.depth };
    const maxDepth = Math.max(0, ...Object.values(depthMemo));
    let graphInCycle = { ...initialAnalysis.inCycle };
    let graphCycles = initialAnalysis.cycles.slice();
    // Annotate nodes with cycle membership for panel rendering
    nodes.forEach(n => { n.inCycle = !!graphInCycle[n.id]; });
    // Show cycle badge if cycles exist (runs once at startup; updateGraph
    // calls updateCycleBadge itself after rebuild).
    setTimeout(updateCycleBadge, 0);

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

    // Arrow markers (normal + cycle variant)
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 12)
      .attr("markerHeight", 12)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5L2.5,0Z")
      .attr("class", "link-arrow");
    defs.append("marker")
      .attr("id", "arrowhead-cycle")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 12)
      .attr("markerHeight", 12)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5L2.5,0Z")
      .attr("class", "link-arrow cycle");

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
      .attr("class", d => "link" + (d.cycle ? " cycle" : ""))
      .attr("marker-end", d => d.cycle ? "url(#arrowhead-cycle)" : "url(#arrowhead)");

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
      .classed("cycle", d => !!d.inCycle)
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

    // --- Groups layout ---
    // Arrange nodes in a grid of clusters, one cluster per group.
    // Nodes without a group go into a dedicated "(ungrouped)" cluster.
    function computeGroupsPositions() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      const byGroup = {};
      nodes.forEach(n => {
        const key = n.group || '(ungrouped)';
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(n);
      });

      const groupKeys = Object.keys(byGroup).sort();
      const groupCount = groupKeys.length;
      if (groupCount === 0) return;

      const cols = Math.ceil(Math.sqrt(groupCount));
      const rows = Math.ceil(groupCount / cols);
      const cellW = w / cols;
      const cellH = h / rows;

      groupKeys.forEach((key, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = cellW * (col + 0.5);
        const cy = cellH * (row + 0.5);
        const members = byGroup[key];
        const ringCount = members.length;
        const radius = Math.min(cellW, cellH) * 0.32;
        if (ringCount === 1) {
          members[0].fx = cx;
          members[0].fy = cy;
        } else {
          members.forEach((n, i) => {
            const angle = (i / ringCount) * Math.PI * 2 - Math.PI / 2;
            n.fx = cx + Math.cos(angle) * radius;
            n.fy = cy + Math.sin(angle) * radius;
          });
        }
      });
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
      } else if (layout === 'groups') {
        // Stop simulation forces, pin nodes into group clusters
        simulation.force("link", null);
        simulation.force("charge", null);
        simulation.force("center", null);
        simulation.force("collision", null);
        computeGroupsPositions();
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
      } else if (currentLayout === 'groups') {
        computeGroupsPositions();
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

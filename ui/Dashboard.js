// ui/Dashboard.js — Main dashboard panel for SillyTavern sidebar

export class Dashboard {
  constructor(neuroController) {
    this.neuro = neuroController;
    this.activeTab = 'memories';
    this.container = null;
  }

  mount(containerEl) {
    this.container = containerEl;
    this.render();
  }

  render() {
    if (!this.container) return;
    const status = this.neuro.getStatus();
    const isActive = status !== null;

    this.container.innerHTML = `
      <div id="neurocore-panel">
        <h3>NeuroCore Brain</h3>
        ${isActive ? this._renderActive(status) : this._renderInactive()}
      </div>
    `;

    if (isActive) {
      this._bindEvents();
      this._showTab(this.activeTab);
    }
  }

  _renderInactive() {
    return '<p style="color: #888; font-size: 0.85em;">Kein aktiver Chat. NeuroCore wartet...</p>';
  }

  _renderActive(status) {
    return `
      ${this._renderStatusBar(status)}
      ${this._renderRegionIndicators(status)}
      ${this._renderTabs()}
      ${this._renderTabContents()}
      ${this._renderActions()}
    `;
  }

  _renderStatusBar(status) {
    const sizeKB = Math.round(status.dbSizeBytes / 1024);
    return `
      <div class="neurocore-status">
        <div class="neurocore-stat">
          <div class="stat-value">${status.messageCount}</div>
          <div class="stat-label">Nachrichten</div>
        </div>
        <div class="neurocore-stat">
          <div class="stat-value">${status.hippocampus.episodes}</div>
          <div class="stat-label">Episoden</div>
        </div>
        <div class="neurocore-stat">
          <div class="stat-value">${status.temporalLobe.nodes}</div>
          <div class="stat-label">Wissen</div>
        </div>
        <div class="neurocore-stat">
          <div class="stat-value">${sizeKB} KB</div>
          <div class="stat-label">DB Größe</div>
        </div>
      </div>
    `;
  }

  _renderRegionIndicators(status) {
    const regions = [
      { name: 'Hippocampus', active: status.hippocampus.episodes > 0 },
      { name: 'Amygdala', active: true },
      { name: 'Temporal', active: status.temporalLobe.nodes > 0 },
      { name: 'Cerebellum', active: status.cerebellum.patterns > 0 },
      { name: 'Basalganglien', active: status.basalGanglia.habits > 0 },
      { name: 'PFC', active: status.messageCount > 0 },
    ];
    const dots = regions.map(r =>
      `<span class="neurocore-region">
        <span class="dot ${r.active ? 'dot-active' : 'dot-inactive'}"></span>
        ${r.name}
      </span>`
    ).join('');
    return `<div class="neurocore-regions">${dots}</div>`;
  }

  _renderTabs() {
    const tabs = [
      { id: 'memories', label: 'Erinnerungen' },
      { id: 'graph', label: 'Wissensgraph' },
      { id: 'patterns', label: 'Muster' },
      { id: 'settings', label: 'Einstellungen' },
    ];
    const btns = tabs.map(t =>
      `<button class="neurocore-tab ${t.id === this.activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
    ).join('');
    return `<div class="neurocore-tabs">${btns}</div>`;
  }

  _renderTabContents() {
    return `
      <div class="neurocore-tab-content" id="neurocore-tab-memories"></div>
      <div class="neurocore-tab-content" id="neurocore-tab-graph">
        <canvas id="neurocore-graph-canvas"></canvas>
      </div>
      <div class="neurocore-tab-content" id="neurocore-tab-patterns"></div>
      <div class="neurocore-tab-content" id="neurocore-tab-settings"></div>
    `;
  }

  _renderActions() {
    return `
      <div class="neurocore-actions">
        <button class="neurocore-btn" id="neurocore-export">Export</button>
        <button class="neurocore-btn" id="neurocore-import">Import</button>
        <button class="neurocore-btn" id="neurocore-consolidate">Konsolidieren</button>
        <button class="neurocore-btn" id="neurocore-refresh">Aktualisieren</button>
      </div>
    `;
  }

  _bindEvents() {
    // Tab switching
    this.container.querySelectorAll('.neurocore-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.container.querySelectorAll('.neurocore-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._showTab(this.activeTab);
      });
    });

    // Action buttons
    const exportBtn = this.container.querySelector('#neurocore-export');
    if (exportBtn) exportBtn.addEventListener('click', () => this._onExport());

    const importBtn = this.container.querySelector('#neurocore-import');
    if (importBtn) importBtn.addEventListener('click', () => this._onImport());

    const consolidateBtn = this.container.querySelector('#neurocore-consolidate');
    if (consolidateBtn) consolidateBtn.addEventListener('click', () => this._onConsolidate());

    const refreshBtn = this.container.querySelector('#neurocore-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.render());
  }

  _showTab(tabId) {
    this.container.querySelectorAll('.neurocore-tab-content').forEach(c => c.classList.remove('active'));
    const panel = this.container.querySelector(`#neurocore-tab-${tabId}`);
    if (panel) {
      panel.classList.add('active');
      this._loadTabContent(tabId, panel);
    }
  }

  _loadTabContent(tabId, panel) {
    if (!this.neuro.db) return;

    switch (tabId) {
      case 'memories':
        this._renderMemories(panel);
        break;
      case 'graph':
        this._renderGraph(panel);
        break;
      case 'patterns':
        this._renderPatterns(panel);
        break;
      case 'settings':
        this._renderSettings(panel);
        break;
    }
  }

  _renderMemories(panel) {
    const episodes = this.neuro.db.all('SELECT * FROM episodes ORDER BY timestamp DESC LIMIT 50');
    if (episodes.length === 0) {
      panel.innerHTML = '<p style="color: #888; font-size: 0.85em;">Noch keine Erinnerungen.</p>';
      return;
    }
    const items = episodes.map(ep => {
      const valenceClass = ep.emotional_valence > 0.6 ? 'high-valence' :
                           ep.emotional_valence > 0.3 ? 'medium-valence' : 'low-valence';
      const content = ep.content.length > 120 ? ep.content.slice(0, 120) + '...' : ep.content;
      const time = new Date(ep.timestamp).toLocaleTimeString('de-DE');
      return `
        <li class="neurocore-memory-item ${valenceClass}">
          <div class="memory-content">${this._escapeHtml(content)}</div>
          <div class="memory-meta">
            Valenz: ${(ep.emotional_valence * 100).toFixed(0)}% |
            Abrufe: ${ep.retrieval_count} |
            ${time}
            ${ep.consolidated ? ' | konsolidiert' : ''}
          </div>
        </li>
      `;
    }).join('');
    panel.innerHTML = `<ul class="neurocore-memory-list">${items}</ul>`;
  }

  _renderGraph(panel) {
    const canvas = panel.querySelector('#neurocore-graph-canvas');
    if (!canvas) return;
    const { nodes, edges } = this.neuro.temporalLobe.getAllNodesAndEdges();
    if (nodes.length === 0) {
      panel.innerHTML = '<p style="color: #888; font-size: 0.85em;">Noch kein Wissensgraph.</p>';
      return;
    }
    this._drawGraph(canvas, nodes, edges);
  }

  _drawGraph(canvas, nodes, edges) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth || 400;
    const h = canvas.height = canvas.offsetHeight || 300;

    ctx.clearRect(0, 0, w, h);

    // Simple force-directed layout (precomputed positions)
    const positions = new Map();
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.35;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });

    // Draw edges
    ctx.strokeStyle = 'rgba(120, 120, 200, 0.4)';
    ctx.lineWidth = 1;
    for (const edge of edges) {
      const from = positions.get(edge.source_id);
      const to = positions.get(edge.target_id);
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    // Draw nodes
    const typeColors = {
      character: '#4caf50',
      item: '#ff9800',
      location: '#2196f3',
      event: '#e53935',
      concept: '#9c27b0',
    };

    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      const color = typeColors[node.type] || '#888';
      const r = 6 + (node.confidence * 8);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y - r - 4);
    }
  }

  _renderPatterns(panel) {
    const patterns = this.neuro.db.all('SELECT * FROM procedural_patterns ORDER BY strength DESC LIMIT 20');
    const habits = this.neuro.db.all('SELECT * FROM habits ORDER BY strength DESC LIMIT 20');

    let html = '';

    if (patterns.length > 0) {
      html += '<h4 style="margin: 4px 0; font-size: 0.9em;">Verhaltensmuster</h4>';
      html += '<ul class="neurocore-memory-list">';
      for (const p of patterns) {
        html += `<li class="neurocore-memory-item">
          <div class="memory-content">${this._escapeHtml(p.trigger_desc)} → ${this._escapeHtml(p.response)}</div>
          <div class="memory-meta">Stärke: ${(p.strength * 100).toFixed(0)}% | Aktivierungen: ${p.activation_count}</div>
        </li>`;
      }
      html += '</ul>';
    }

    if (habits.length > 0) {
      html += '<h4 style="margin: 8px 0 4px; font-size: 0.9em;">Gewohnheiten</h4>';
      html += '<ul class="neurocore-memory-list">';
      for (const h of habits) {
        html += `<li class="neurocore-memory-item">
          <div class="memory-content">${this._escapeHtml(h.context)} → ${this._escapeHtml(h.behavior)}</div>
          <div class="memory-meta">Stärke: ${(h.strength * 100).toFixed(0)}% | Belohnung: ${(h.average_reward * 100).toFixed(0)}%</div>
        </li>`;
      }
      html += '</ul>';
    }

    if (!html) {
      html = '<p style="color: #888; font-size: 0.85em;">Noch keine Muster erkannt.</p>';
    }

    panel.innerHTML = html;
  }

  _renderSettings(panel) {
    const s = this.neuro.settings;
    panel.innerHTML = `
      <div class="neurocore-settings">
        <label>
          Max Slots (Working Memory)
          <input type="number" id="neurocore-s-slots" value="${s.maxSlots}" min="1" max="20">
        </label>
        <label>
          Token Budget (%)
          <input type="number" id="neurocore-s-budget" value="${s.tokenBudgetPercent}" min="1" max="50">
        </label>
        <label>
          Konsolidierungs-Intervall
          <input type="number" id="neurocore-s-interval" value="${s.consolidationInterval}" min="5" max="100">
        </label>
      </div>
    `;

    // Bind settings change
    const inputs = panel.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        const slots = parseInt(panel.querySelector('#neurocore-s-slots').value) || 8;
        const budget = parseInt(panel.querySelector('#neurocore-s-budget').value) || 15;
        const interval = parseInt(panel.querySelector('#neurocore-s-interval').value) || 10;
        this.neuro.settings.maxSlots = slots;
        this.neuro.settings.tokenBudgetPercent = budget;
        this.neuro.settings.consolidationInterval = interval;
      });
    });
  }

  async _onExport() {
    try {
      const { JsonExporter } = await import('../core/storage/JsonExporter.js');
      const exporter = new JsonExporter(this.neuro.db);
      const data = exporter.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neurocore-brain-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[NeuroCore] Export failed:', err);
    }
  }

  async _onImport() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);
        const { JsonExporter } = await import('../core/storage/JsonExporter.js');
        const importer = new JsonExporter(this.neuro.db);
        importer.importAll(data);
        await this.neuro.db.save();
        this.render();
      });
      input.click();
    } catch (err) {
      console.error('[NeuroCore] Import failed:', err);
    }
  }

  async _onConsolidate() {
    try {
      const msgCount = this.neuro.db.getMessageCount();
      await this.neuro.consolidation.runFullCycle(msgCount);
      await this.neuro.db.save();
      this.render();
    } catch (err) {
      console.error('[NeuroCore] Consolidation failed:', err);
    }
  }

  _escapeHtml(text) {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

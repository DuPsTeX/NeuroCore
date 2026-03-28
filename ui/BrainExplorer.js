// ui/BrainExplorer.js — Full brain data explorer with search, sort, filter, pagination

const PAGE_SIZE = 25;

let currentPage = 0;
let currentResults = [];
let dbRef = null;
let neuroRef = null;

export function initExplorer(neuro) {
  neuroRef = neuro;
  dbRef = neuro.db;

  $(document).on('click', '#neurocore-explorer-close', closeExplorer);
  $(document).on('click', '#neurocore-explorer-overlay', function (e) {
    if (e.target === this) closeExplorer();
  });
  $(document).on('input', '#explorer-search-input', debounce(runQuery, 300));
  $(document).on('change', '#explorer-category', runQuery);
  $(document).on('change', '#explorer-sort', runQuery);
  $(document).on('click', '.explorer-page-btn', function () {
    currentPage = parseInt($(this).data('page'));
    renderPage();
  });
  $(document).on('click', '.explorer-item-toggle', function () {
    $(this).closest('.explorer-item').find('.explorer-item-full').toggle();
  });
}

export function openExplorer() {
  if (!neuroRef || !neuroRef.db) {
    dbRef = neuroRef?.db;
  } else {
    dbRef = neuroRef.db;
  }
  $('#neurocore-explorer-overlay').show();
  runQuery();
}

function closeExplorer() {
  $('#neurocore-explorer-overlay').hide();
}

function runQuery() {
  if (!dbRef) return;

  const search = ($('#explorer-search-input').val() || '').trim().toLowerCase();
  const category = $('#explorer-category').val();
  const sort = $('#explorer-sort').val();

  currentResults = [];

  if (category === 'all' || category === 'episodes') {
    const episodes = dbRef.all('SELECT * FROM episodes');
    for (const ep of episodes) {
      if (search && !ep.content.toLowerCase().includes(search) && !ep.keywords.toLowerCase().includes(search)) continue;
      currentResults.push({
        type: 'episode',
        typeLabel: 'Episode',
        timestamp: ep.timestamp,
        valence: ep.emotional_valence,
        retrievalCount: ep.retrieval_count,
        strength: ep.emotional_valence,
        consolidated: !!ep.consolidated,
        id: ep.id,
        title: truncate(ep.content, 100),
        full: ep.content,
        meta: [
          `Valenz: ${(ep.emotional_valence * 100).toFixed(0)}%`,
          `Abrufe: ${ep.retrieval_count}`,
          ep.consolidated ? 'Konsolidiert' : 'Nicht konsolidiert',
          `Sender: ${safeJson(ep.participants)}`,
          `Keywords: ${safeJson(ep.keywords)}`,
        ],
      });
    }
  }

  if (category === 'all' || category === 'consolidated') {
    const consolidated = dbRef.all('SELECT * FROM consolidated_memories');
    for (const cm of consolidated) {
      const summary = cm.summary || '';
      if (search && !summary.toLowerCase().includes(search) && !cm.themes.toLowerCase().includes(search)) continue;
      currentResults.push({
        type: 'consolidated',
        typeLabel: 'Langzeit',
        timestamp: 0,
        valence: cm.importance,
        retrievalCount: 0,
        strength: cm.importance,
        id: cm.id,
        title: truncate(summary, 100),
        full: summary,
        meta: [
          `Wichtigkeit: ${(cm.importance * 100).toFixed(0)}%`,
          `Themen: ${safeJson(cm.themes)}`,
          `Quell-Episoden: ${countJson(cm.source_episodes)}`,
        ],
      });
    }
  }

  if (category === 'all' || category === 'semantic') {
    const nodes = dbRef.all('SELECT * FROM semantic_nodes');
    for (const node of nodes) {
      if (search && !node.label.toLowerCase().includes(search) && !node.type.toLowerCase().includes(search)) continue;
      const edges = dbRef.all(
        'SELECT * FROM semantic_edges WHERE source_id = ? OR target_id = ?',
        [node.id, node.id]
      );
      const edgeLabels = edges.map(e => {
        const otherId = e.source_id === node.id ? e.target_id : e.source_id;
        const other = dbRef.get('SELECT label FROM semantic_nodes WHERE id = ?', [otherId]);
        return `${e.relation} → ${other ? other.label : '?'}`;
      });

      currentResults.push({
        type: 'semantic',
        typeLabel: `Wissen (${node.type})`,
        timestamp: 0,
        valence: node.confidence,
        retrievalCount: 0,
        strength: node.confidence,
        id: node.id,
        title: `${node.label} [${node.type}]`,
        full: `Label: ${node.label}\nTyp: ${node.type}\nKonfidenz: ${(node.confidence * 100).toFixed(0)}%\nProperties: ${node.properties}\n\nVerbindungen (${edges.length}):\n${edgeLabels.join('\n') || '(keine)'}`,
        meta: [
          `Typ: ${node.type}`,
          `Konfidenz: ${(node.confidence * 100).toFixed(0)}%`,
          `Verbindungen: ${edges.length}`,
        ],
      });
    }
  }

  if (category === 'all' || category === 'patterns') {
    const patterns = dbRef.all('SELECT * FROM procedural_patterns');
    for (const p of patterns) {
      if (search && !p.trigger_desc.toLowerCase().includes(search) && !p.response.toLowerCase().includes(search)) continue;
      currentResults.push({
        type: 'pattern',
        typeLabel: 'Muster',
        timestamp: p.last_activated,
        valence: 0,
        retrievalCount: p.activation_count,
        strength: p.strength,
        id: p.id,
        title: `${p.trigger_desc} → ${truncate(p.response, 60)}`,
        full: `Trigger: ${p.trigger_desc}\nKeywords: ${p.trigger_keywords}\nAntwort: ${p.response}\nBeispiele: ${p.examples}`,
        meta: [
          `Staerke: ${(p.strength * 100).toFixed(0)}%`,
          `Aktivierungen: ${p.activation_count}`,
          p.last_activated ? `Zuletzt: ${formatTime(p.last_activated)}` : '',
        ].filter(Boolean),
      });
    }
  }

  if (category === 'all' || category === 'habits') {
    const habits = dbRef.all('SELECT * FROM habits');
    for (const h of habits) {
      if (search && !h.context.toLowerCase().includes(search) && !h.behavior.toLowerCase().includes(search)) continue;
      currentResults.push({
        type: 'habit',
        typeLabel: 'Gewohnheit',
        timestamp: 0,
        valence: 0,
        retrievalCount: 0,
        strength: h.strength,
        id: h.id,
        title: `${h.context} → ${truncate(h.behavior, 60)}`,
        full: `Kontext: ${h.context}\nVerhalten: ${h.behavior}\nBelohnungs-History: ${h.reward_history}\nDurchschn. Belohnung: ${(h.average_reward * 100).toFixed(0)}%`,
        meta: [
          `Staerke: ${(h.strength * 100).toFixed(0)}%`,
          `Belohnung: ${(h.average_reward * 100).toFixed(0)}%`,
        ],
      });
    }
  }

  if (category === 'all' || category === 'emotions') {
    const tags = dbRef.all(`
      SELECT et.*, e.content as episode_content
      FROM emotional_tags et
      LEFT JOIN episodes e ON et.episode_id = e.id
    `);
    for (const tag of tags) {
      if (search && !tag.type.toLowerCase().includes(search) && !(tag.evidence || '').toLowerCase().includes(search)) continue;
      currentResults.push({
        type: 'emotion',
        typeLabel: `Emotion (${tag.type})`,
        timestamp: 0,
        valence: tag.intensity,
        retrievalCount: 0,
        strength: tag.intensity,
        id: tag.id,
        title: `${tag.type} — ${(tag.intensity * 100).toFixed(0)}%`,
        full: `Typ: ${tag.type}\nIntensitaet: ${(tag.intensity * 100).toFixed(0)}%\nEvidenz: ${tag.evidence}\n\nEpisode: ${tag.episode_content || '(geloescht)'}`,
        meta: [
          `Intensitaet: ${(tag.intensity * 100).toFixed(0)}%`,
          `Evidenz: ${truncate(tag.evidence, 50)}`,
        ],
      });
    }
  }

  // Sort
  sortResults(sort);

  currentPage = 0;
  updateStats();
  renderPage();
}

function sortResults(sort) {
  switch (sort) {
    case 'newest':
      currentResults.sort((a, b) => b.timestamp - a.timestamp);
      break;
    case 'oldest':
      currentResults.sort((a, b) => a.timestamp - b.timestamp);
      break;
    case 'valence-high':
      currentResults.sort((a, b) => b.valence - a.valence);
      break;
    case 'valence-low':
      currentResults.sort((a, b) => a.valence - b.valence);
      break;
    case 'most-retrieved':
      currentResults.sort((a, b) => b.retrievalCount - a.retrievalCount);
      break;
    case 'strongest':
      currentResults.sort((a, b) => b.strength - a.strength);
      break;
  }
}

function updateStats() {
  const types = {};
  for (const r of currentResults) {
    types[r.type] = (types[r.type] || 0) + 1;
  }
  const labels = {
    episode: 'Episoden', consolidated: 'Langzeit', semantic: 'Wissen',
    pattern: 'Muster', habit: 'Gewohnheiten', emotion: 'Emotionen',
  };
  const parts = Object.entries(types).map(([t, c]) => `${labels[t] || t}: ${c}`);
  $('#explorer-stats').html(
    `<span><b>${currentResults.length}</b> Eintraege gefunden</span>` +
    (parts.length > 1 ? `<span class="explorer-stats-detail">${parts.join(' | ')}</span>` : '')
  );
}

function renderPage() {
  const start = currentPage * PAGE_SIZE;
  const page = currentResults.slice(start, start + PAGE_SIZE);
  const container = $('#explorer-results');

  if (currentResults.length === 0) {
    container.html('<p class="neurocore-placeholder">Keine Eintraege gefunden.</p>');
    $('#explorer-pagination').html('');
    return;
  }

  const typeColors = {
    episode: '#2196f3', consolidated: '#9c27b0', semantic: '#4caf50',
    pattern: '#ff9800', habit: '#e91e63', emotion: '#f44336',
  };

  let html = '';
  for (const item of page) {
    const color = typeColors[item.type] || '#888';
    const time = item.timestamp ? formatTime(item.timestamp) : '';
    html += `
      <div class="explorer-item" style="border-left-color: ${color};">
        <div class="explorer-item-header">
          <span class="explorer-type-badge" style="background: ${color};">${escapeHtml(item.typeLabel)}</span>
          <span class="explorer-item-title explorer-item-toggle">${escapeHtml(item.title)}</span>
          ${time ? `<span class="explorer-item-time">${time}</span>` : ''}
        </div>
        <div class="explorer-item-meta">${item.meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>
        <pre class="explorer-item-full" style="display: none;">${escapeHtml(item.full)}</pre>
      </div>
    `;
  }
  container.html(html);

  // Pagination
  const totalPages = Math.ceil(currentResults.length / PAGE_SIZE);
  if (totalPages <= 1) {
    $('#explorer-pagination').html('');
    return;
  }

  let paginationHtml = '';
  for (let i = 0; i < totalPages; i++) {
    const active = i === currentPage ? 'active' : '';
    paginationHtml += `<button class="explorer-page-btn menu_button ${active}" data-page="${i}">${i + 1}</button>`;
  }
  $('#explorer-pagination').html(
    `<span>Seite ${currentPage + 1} von ${totalPages}</span>` +
    `<div class="explorer-page-buttons">${paginationHtml}</div>`
  );
}

// --- Helpers ---

function truncate(text, len) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len) + '...' : text;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function safeJson(str) {
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr.join(', ') : str;
  } catch {
    return str || '';
  }
}

function countJson(str) {
  try {
    return JSON.parse(str).length;
  } catch {
    return '?';
  }
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// index.js — SillyTavern Extension Entry Point
// Hooks into ST events and wires them to NeuroController

import { NeuroController } from './core/NeuroController.js';

const MODULE_NAME = 'neurocore';
const neuro = new NeuroController();

// Maps ST message index → NeuroCore episode ID
const messageEpisodeMap = new Map();

let currentChatId = null;
let isInitialized = false;
let dashboardRefreshTimer = null;

// --- SillyTavern Extension API ---

async function initExtension() {
  // ST context
  const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  if (!context) {
    console.warn('[NeuroCore] SillyTavern context not available');
    return;
  }

  // Render settings panel into ST extension area
  await mountDashboard(context);

  const chatId = getChatId(context);
  if (chatId) {
    currentChatId = chatId;

    const llmCallback = createLlmCallback(context);
    await neuro.initialize(chatId, {}, llmCallback);
    isInitialized = true;

    // Auto-import existing chat messages into the brain
    const imported = await importExistingChat();
    if (imported > 0) {
      await neuro.db.save();
      console.log('[NeuroCore] Initial import: %d messages', imported);
    }

    refreshDashboard();
  }

  // Register event listeners using ST's event type constants
  const eventSource = context.eventSource;
  const eventTypes = context.eventTypes || context.event_types;
  if (eventSource && eventTypes) {
    eventSource.on(eventTypes.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageDeleted);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessageUpdated);
    console.log('[NeuroCore] Event listeners registered:', {
      MESSAGE_RECEIVED: eventTypes.MESSAGE_RECEIVED,
      CHAT_CHANGED: eventTypes.CHAT_CHANGED,
      MESSAGE_DELETED: eventTypes.MESSAGE_DELETED,
      MESSAGE_UPDATED: eventTypes.MESSAGE_UPDATED,
    });
  } else {
    console.error('[NeuroCore] eventSource or eventTypes not available on context!');
  }

  // Register prompt injection hook
  if (typeof context.setExtensionPrompt === 'function') {
    registerPromptHook(context);
  }

  console.log('[NeuroCore] Extension initialized for chat:', chatId || '(no chat open)');
}

// Log uncaught errors in the extension
window.addEventListener?.('error', (e) => {
  if (e.filename?.includes('neurocore')) {
    console.error('[NeuroCore] Uncaught error:', e.message, e.filename, e.lineno);
  }
});

function createLlmCallback(context) {
  return async (text) => {
    if (typeof context.generateQuietPrompt === 'function') {
      return context.generateQuietPrompt(
        `Fasse die folgenden Ereignisse in 1-2 Sätzen zusammen. Behalte die Sprache bei:\n\n${text}`
      );
    }
    return null;
  };
}

function getChatId(context) {
  if (context.chatId) return context.chatId;
  if (context.characters && context.characterIndex >= 0) {
    return `char-${context.characters[context.characterIndex]?.avatar || 'unknown'}`;
  }
  return null;
}

// --- Dashboard UI ---

async function mountDashboard(context) {
  try {
    if (typeof context.renderExtensionTemplateAsync !== 'function') {
      console.error('[NeuroCore] renderExtensionTemplateAsync not available on context');
      return;
    }
    const settingsHtml = await context.renderExtensionTemplateAsync(
      'third-party/neurocore', 'settings', {}, true, true
    );
    $('#extensions_settings2').append(settingsHtml);
    bindDashboardEvents();
    console.log('[NeuroCore] Dashboard mounted successfully');
  } catch (err) {
    console.error('[NeuroCore] Failed to mount dashboard:', err);
  }
}

function bindDashboardEvents() {
  // Tab switching
  $(document).on('click', '.neurocore-tab', function () {
    const tabId = $(this).data('tab');
    $('.neurocore-tab').removeClass('active');
    $(this).addClass('active');
    $('.neurocore-tab-content').removeClass('active');
    $(`#neurocore-tab-${tabId}`).addClass('active');

    if (tabId === 'graph') renderGraph();
    if (tabId === 'memories') renderMemories();
    if (tabId === 'patterns') renderPatterns();
  });

  // Action buttons
  $(document).on('click', '#neurocore-export', onExport);
  $(document).on('click', '#neurocore-import', onImport);
  $(document).on('click', '#neurocore-consolidate', onConsolidate);
  $(document).on('click', '#neurocore-refresh', refreshDashboard);
  $(document).on('click', '#neurocore-show-injection', onShowInjection);
  $(document).on('click', '#neurocore-popup-close', () => $('#neurocore-injection-popup').hide());

  // Settings changes
  $(document).on('change', '#neurocore-s-slots', function () {
    neuro.settings.maxSlots = parseInt($(this).val()) || 8;
  });
  $(document).on('change', '#neurocore-s-budget', function () {
    neuro.settings.tokenBudgetPercent = parseInt($(this).val()) || 15;
  });
  $(document).on('change', '#neurocore-s-interval', function () {
    neuro.settings.consolidationInterval = parseInt($(this).val()) || 10;
  });
}

function refreshDashboard() {
  if (!neuro.db) return;
  const status = neuro.getStatus();
  if (!status) return;

  $('#neurocore-msg-count').text(status.messageCount);
  $('#neurocore-ep-count').text(status.hippocampus.episodes);
  $('#neurocore-node-count').text(status.temporalLobe.nodes);
  $('#neurocore-db-size').text(Math.round(status.dbSizeBytes / 1024) + ' KB');

  // Region indicators
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
  $('#neurocore-regions').html(dots);

  // Update settings inputs
  $('#neurocore-s-slots').val(neuro.settings.maxSlots);
  $('#neurocore-s-budget').val(neuro.settings.tokenBudgetPercent);
  $('#neurocore-s-interval').val(neuro.settings.consolidationInterval);

  // Render active tab
  const activeTab = $('.neurocore-tab.active').data('tab') || 'memories';
  if (activeTab === 'memories') renderMemories();
  if (activeTab === 'patterns') renderPatterns();
  if (activeTab === 'graph') renderGraph();
}

function renderMemories() {
  if (!neuro.db) return;
  const episodes = neuro.db.all('SELECT * FROM episodes ORDER BY timestamp DESC LIMIT 50');
  const container = $('#neurocore-memory-list');

  if (episodes.length === 0) {
    container.html('<p class="neurocore-placeholder">Noch keine Erinnerungen.</p>');
    return;
  }

  const items = episodes.map(ep => {
    const valenceClass = ep.emotional_valence > 0.6 ? 'high-valence' :
                         ep.emotional_valence > 0.3 ? 'medium-valence' : 'low-valence';
    const content = ep.content.length > 120 ? ep.content.slice(0, 120) + '...' : ep.content;
    const time = new Date(ep.timestamp).toLocaleTimeString('de-DE');
    return `
      <div class="neurocore-memory-item ${valenceClass}">
        <div class="memory-content">${escapeHtml(content)}</div>
        <div class="memory-meta">
          Valenz: ${(ep.emotional_valence * 100).toFixed(0)}% |
          Abrufe: ${ep.retrieval_count} |
          ${time}${ep.consolidated ? ' | konsolidiert' : ''}
        </div>
      </div>
    `;
  }).join('');
  container.html(items);
}

function renderPatterns() {
  if (!neuro.db) return;
  const patterns = neuro.db.all('SELECT * FROM procedural_patterns ORDER BY strength DESC LIMIT 20');
  const habits = neuro.db.all('SELECT * FROM habits ORDER BY strength DESC LIMIT 20');
  const container = $('#neurocore-patterns-list');

  let html = '';

  if (patterns.length > 0) {
    html += '<h4 style="margin: 4px 0; font-size: 0.9em;">Verhaltensmuster</h4>';
    for (const p of patterns) {
      html += `<div class="neurocore-memory-item">
        <div class="memory-content">${escapeHtml(p.trigger_desc)} → ${escapeHtml(p.response)}</div>
        <div class="memory-meta">Stärke: ${(p.strength * 100).toFixed(0)}% | Aktivierungen: ${p.activation_count}</div>
      </div>`;
    }
  }

  if (habits.length > 0) {
    html += '<h4 style="margin: 8px 0 4px; font-size: 0.9em;">Gewohnheiten</h4>';
    for (const h of habits) {
      html += `<div class="neurocore-memory-item">
        <div class="memory-content">${escapeHtml(h.context)} → ${escapeHtml(h.behavior)}</div>
        <div class="memory-meta">Stärke: ${(h.strength * 100).toFixed(0)}% | Belohnung: ${(h.average_reward * 100).toFixed(0)}%</div>
      </div>`;
    }
  }

  container.html(html || '<p class="neurocore-placeholder">Noch keine Muster erkannt.</p>');
}

function renderGraph() {
  if (!neuro.db || !neuro.temporalLobe) return;
  const canvas = document.getElementById('neurocore-graph-canvas');
  if (!canvas) return;

  const { nodes, edges } = neuro.temporalLobe.getAllNodesAndEdges();
  if (nodes.length === 0) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.parentElement?.offsetWidth || 400;
  const h = canvas.height = 300;
  ctx.clearRect(0, 0, w, h);

  // Circular layout
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
    character: '#4caf50', item: '#ff9800', location: '#2196f3',
    event: '#e53935', concept: '#9c27b0',
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

// --- Action handlers ---

async function onExport() {
  try {
    const { JsonExporter } = await import('./core/storage/JsonExporter.js');
    const exporter = new JsonExporter(neuro.db);
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

async function onImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      const { JsonExporter } = await import('./core/storage/JsonExporter.js');
      new JsonExporter(neuro.db).importAll(data);
      await neuro.db.save();
      refreshDashboard();
    } catch (err) {
      console.error('[NeuroCore] Import failed:', err);
    }
  });
  input.click();
}

function getMessageExternalId(msg, index) {
  // Use send_date as unique ID; fallback to index-based hash
  if (msg.send_date) return String(msg.send_date);
  return `msg-idx-${index}-${(msg.mes || '').length}`;
}

async function importExistingChat() {
  const context = SillyTavern.getContext();
  const chat = context.chat;
  if (!chat || chat.length === 0) {
    console.log('[NeuroCore] No chat messages to import');
    return 0;
  }

  console.log('[NeuroCore] Importing existing chat messages (%d total)...', chat.length);
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    const text = msg.mes || '';
    if (!text.trim()) continue;

    const externalId = getMessageExternalId(msg, i);

    // Deduplicate: skip if already in DB
    const existingId = neuro.hippocampus.hasEpisodeByExternalId(externalId);
    if (existingId) {
      messageEpisodeMap.set(i, existingId);
      skipped++;
      continue;
    }

    const sender = msg.is_user ? 'user' : (msg.name || 'character');
    try {
      const episodeId = await neuro.processMessage(text, sender, i, externalId);
      messageEpisodeMap.set(i, episodeId);
      imported++;
    } catch (err) {
      console.warn('[NeuroCore] Failed to import message %d:', i, err.message);
    }
  }

  console.log('[NeuroCore] Imported %d new messages, %d already known', imported, skipped);
  return imported;
}

async function onConsolidate() {
  console.log('[NeuroCore] Consolidate button clicked, isInitialized:', isInitialized, 'db:', !!neuro.db);
  if (!neuro.db) {
    console.warn('[NeuroCore] Cannot consolidate — database not initialized');
    return;
  }
  try {
    // First import any existing chat messages that aren't in the DB yet
    const imported = await importExistingChat();
    if (imported > 0) {
      console.log('[NeuroCore] Imported %d messages before consolidation', imported);
    }

    const msgCount = neuro.db.getMessageCount();
    console.log('[NeuroCore] Running consolidation, message count:', msgCount);
    await neuro.consolidation.runFullCycle(msgCount);
    await neuro.db.save();
    console.log('[NeuroCore] Consolidation complete');
    refreshDashboard();
  } catch (err) {
    console.error('[NeuroCore] Consolidation failed:', err);
  }
}

function onShowInjection() {
  const injection = neuro.lastPromptInjection || '';
  const container = $('#neurocore-injection-content');
  const meta = $('#neurocore-popup-meta');
  const popup = $('#neurocore-injection-popup');

  if (!injection.trim()) {
    container.text('(Noch kein Memory-Prompt generiert. Sende zuerst eine Nachricht.)');
    meta.html('');
  } else {
    container.text(injection);
    const tokens = neuro.pfc.estimateTokens(injection);
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
    const maxCtx = context?.maxContext || 4096;
    const budget = Math.floor(maxCtx * (neuro.settings.tokenBudgetPercent / 100));
    meta.html(
      `<span>~${tokens} Tokens</span>` +
      `<span>Budget: ${budget} / ${maxCtx} (${neuro.settings.tokenBudgetPercent}%)</span>` +
      `<span>Slots: ${neuro.settings.maxSlots}</span>`
    );
  }

  popup.toggle();
}

// --- Event Handlers ---

async function onMessageReceived(messageIndex) {
  console.log('[NeuroCore] message_received fired, index:', messageIndex, 'isInitialized:', isInitialized);
  if (!isInitialized) return;
  try {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageIndex]) return;

    const msg = chat[messageIndex];
    const sender = msg.is_user ? 'user' : (msg.name || 'character');
    const text = msg.mes || '';

    if (!text.trim()) return;

    const externalId = getMessageExternalId(msg, messageIndex);
    console.log('[NeuroCore] Processing message from', sender, '- length:', text.length);
    const episodeId = await neuro.processMessage(text, sender, messageIndex, externalId);
    console.log('[NeuroCore] Stored episode:', episodeId);
    messageEpisodeMap.set(messageIndex, episodeId);
    refreshDashboard();
  } catch (err) {
    console.error('[NeuroCore] Error processing message:', err);
  }
}

async function onChatChanged() {
  try {
    const context = SillyTavern.getContext();
    const newChatId = getChatId(context);
    if (!newChatId || newChatId === currentChatId) return;

    currentChatId = newChatId;
    messageEpisodeMap.clear();

    const llmCallback = createLlmCallback(context);
    await neuro.switchChat(newChatId, llmCallback);
    isInitialized = true;

    // Auto-import existing chat messages into the brain
    const imported = await importExistingChat();
    if (imported > 0) {
      await neuro.db.save();
    }

    refreshDashboard();
    console.log('[NeuroCore] Switched to chat:', newChatId, '- imported', imported, 'messages');
  } catch (err) {
    console.error('[NeuroCore] Error switching chat:', err);
  }
}

function onMessageDeleted(messageIndex) {
  if (!isInitialized) return;
  const episodeId = messageEpisodeMap.get(messageIndex);
  if (episodeId) {
    neuro.handleMessageDeleted(episodeId);
    messageEpisodeMap.delete(messageIndex);
    refreshDashboard();
  }
}

async function onMessageUpdated(messageIndex) {
  if (!isInitialized) return;
  try {
    const context = SillyTavern.getContext();
    const msg = context.chat?.[messageIndex];
    if (!msg) return;

    const episodeId = messageEpisodeMap.get(messageIndex);
    if (episodeId) {
      neuro.handleMessageEdited(episodeId, msg.mes || '');
    }
  } catch (err) {
    console.error('[NeuroCore] Error updating message:', err);
  }
}

function registerPromptHook(context) {
  const eventSource = context.eventSource;
  const eventTypes = context.eventTypes || context.event_types;
  if (eventSource && eventTypes) {
    eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      const injection = neuro.getPromptInjection(context.maxContext || 4096);
      if (injection && injection.trim()) {
        context.setExtensionPrompt(MODULE_NAME, injection, 1, 0);
      }
    });
    console.log('[NeuroCore] Prompt hook registered on:', eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Extension lifecycle ---

export function getNeuroController() { return neuro; }
export function getMessageEpisodeMap() { return messageEpisodeMap; }

if (typeof jQuery !== 'undefined') {
  jQuery(async () => {
    await initExtension();
  });
}

export { neuro, MODULE_NAME };

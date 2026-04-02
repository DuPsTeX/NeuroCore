// index.js — SillyTavern Extension Entry Point
// Hooks into ST events and wires them to NeuroController

import { NeuroController } from './core/NeuroController.js';
import { initExplorer, openExplorer } from './ui/BrainExplorer.js';

const MODULE_NAME = 'neurocore';
const neuro = new NeuroController();

// Maps ST message index → NeuroCore episode ID
const messageEpisodeMap = new Map();

let currentChatId = null;
let isInitialized = false;
let dashboardRefreshTimer = null;

// --- Settings Persistence ---

const DEFAULT_EXTENSION_SETTINGS = {
  maxSlots: 8,
  tokenBudgetPercent: 15,
  consolidationInterval: 10,
  plotModeEnabled: false,
  plotKeepRecentMessages: 4,
};

function loadSettings() {
  const context = SillyTavern.getContext();
  if (!context.extensionSettings[MODULE_NAME]) {
    context.extensionSettings[MODULE_NAME] = { ...DEFAULT_EXTENSION_SETTINGS };
  }
  const saved = context.extensionSettings[MODULE_NAME];
  // Apply saved settings to neuro controller
  Object.assign(neuro.settings, saved);
  console.log('[NeuroCore] Settings loaded:', saved);
}

function saveSettings() {
  const context = SillyTavern.getContext();
  context.extensionSettings[MODULE_NAME] = {
    maxSlots: neuro.settings.maxSlots,
    tokenBudgetPercent: neuro.settings.tokenBudgetPercent,
    consolidationInterval: neuro.settings.consolidationInterval,
    plotModeEnabled: neuro.settings.plotModeEnabled,
    plotKeepRecentMessages: neuro.settings.plotKeepRecentMessages,
  };
  context.saveSettingsDebounced();
}

// --- SillyTavern Extension API ---

async function initExtension() {
  // ST context
  const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  if (!context) {
    console.warn('[NeuroCore] SillyTavern context not available');
    return;
  }

  // Load persisted settings
  loadSettings();

  // Render settings panel into ST extension area
  await mountDashboard(context);

  const chatId = getChatId(context);
  if (chatId) {
    currentChatId = chatId;

    const llmCallback = createLlmCallback(context);
    await neuro.initialize(chatId, neuro.settings, llmCallback);
    isInitialized = true;

    // Auto-import existing chat messages into the brain
    const imported = await importExistingChat();
    if (imported > 0) {
      await neuro.db.save();
      console.log('[NeuroCore] Initial import: %d messages', imported);
    }

    // Set initial extension prompt so it's ready for the first generate
    if (typeof context.setExtensionPrompt === 'function') {
      updateExtensionPrompt();
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
  return async (prompt) => {
    // Try direct lightweight API call first (no system prompt overhead)
    try {
      const result = await directLlmCall(prompt);
      if (result) return result;
    } catch (err) {
      console.warn('[NeuroCore] Direct API call failed, falling back to generateQuietPrompt:', err.message);
    }

    // Fallback: generateQuietPrompt (includes full ST context — heavier)
    if (typeof context.generateQuietPrompt === 'function') {
      return context.generateQuietPrompt(prompt);
    }
    return null;
  };
}

/**
 * Map chat_completion_source → settings property name for the model.
 * Mirrors SillyTavern's getChatCompletionModel() from openai.js.
 */
const SOURCE_MODEL_MAP = {
  openai: 'openai_model',
  claude: 'claude_model',
  openrouter: 'openrouter_model',
  deepseek: 'deepseek_model',
  mistralai: 'mistralai_model',
  custom: 'custom_model',
  cohere: 'cohere_model',
  perplexity: 'perplexity_model',
  groq: 'groq_model',
  ai21: 'ai21_model',
  makersuite: 'google_model',
  vertexai: 'vertexai_model',
  xai: 'xai_model',
  aimlapi: 'aimlapi_model',
  nanogpt: 'nanogpt_model',
  chutes: 'chutes_model',
  electronhub: 'electronhub_model',
  pollinations: 'pollinations_model',
  moonshot: 'moonshot_model',
  fireworks: 'fireworks_model',
  cometapi: 'cometapi_model',
  azure_openai: 'azure_openai_model',
  zai: 'zai_model',
  siliconflow: 'siliconflow_model',
};

/**
 * Direct API call through ST's backend — sends ONLY the consolidation prompt,
 * without the full system prompt, character sheet, lorebook etc.
 * Saves massive amounts of tokens on every consolidation call.
 */
async function directLlmCall(prompt) {
  const ctx = SillyTavern.getContext();
  const mainApi = ctx.mainApi;

  // Only works for chat completion type APIs
  if (mainApi !== 'openai') return null;

  const settings = ctx.chatCompletionSettings;
  if (!settings) return null;

  const source = settings.chat_completion_source;

  // Look up model name from source-specific settings field
  const modelField = SOURCE_MODEL_MAP[source];
  const model = modelField ? settings[modelField] : null;
  if (!model) {
    console.warn('[NeuroCore] No model found for source:', source);
    return null;
  }

  const headers = ctx.getRequestHeaders();

  // DeepSeek-Reasoner uses reasoning tokens from max_tokens budget,
  // doesn't support system role or temperature
  const isReasoner = model.includes('reasoner');
  const systemInstruction = 'Du bist ein Analyse-Assistent für ein Gedächtnissystem. Antworte DIREKT und NUR mit dem geforderten Format (JSON/Text). Keine Erklärungen, kein Nachdenken, nur das Ergebnis.';

  const messages = isReasoner
    ? [{ role: 'user', content: `${systemInstruction}\n\n${prompt}` }]
    : [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ];

  const payload = {
    messages,
    model,
    temperature: isReasoner ? undefined : 0.3,
    max_tokens: isReasoner ? 8000 : 4000,
    chat_completion_source: source,
    stream: false,
  };

  // Pass reverse proxy settings if configured (custom API endpoints)
  if (settings.reverse_proxy) {
    payload.reverse_proxy = settings.reverse_proxy;
    if (settings.proxy_password) {
      payload.proxy_password = settings.proxy_password;
    }
  }

  console.log('[NeuroCore] Direct API call — source:', source, 'model:', model);

  const response = await fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`API responded with ${response.status} ${response.statusText}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  // Handle various response formats from different providers
  const msg = data.choices?.[0]?.message;
  if (msg) {
    // DeepSeek-Reasoner returns content in reasoning_content, with empty content field
    if (msg.content) return msg.content;
    if (msg.reasoning_content) {
      console.log('[NeuroCore] Using reasoning_content (DeepSeek-Reasoner)');
      return msg.reasoning_content;
    }
  }
  if (data.choices?.[0]?.text) return data.choices[0].text;
  if (typeof data === 'string') return data;
  if (data.content) {
    return typeof data.content === 'string' ? data.content : data.content[0]?.text;
  }

  console.warn('[NeuroCore] Unexpected API response format:', JSON.stringify(data).slice(0, 200));
  return null;
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

    // Mount explorer overlay to body (needs to be outside the panel for full-screen)
    const explorerHtml = await context.renderExtensionTemplateAsync(
      'third-party/neurocore', 'explorer', {}, true, true
    );
    $('body').append(explorerHtml);

    bindDashboardEvents();
    initExplorer(neuro);
    console.log('[NeuroCore] Dashboard + Explorer mounted successfully');
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
  $(document).on('click', '#neurocore-open-explorer', openExplorer);

  // Settings changes — all persist via saveSettings()
  $(document).on('change', '#neurocore-s-slots', function () {
    neuro.settings.maxSlots = parseInt($(this).val()) || 8;
    saveSettings();
  });
  $(document).on('change', '#neurocore-s-budget', function () {
    neuro.settings.tokenBudgetPercent = parseInt($(this).val()) || 15;
    saveSettings();
  });
  $(document).on('change', '#neurocore-s-interval', function () {
    neuro.settings.consolidationInterval = parseInt($(this).val()) || 10;
    saveSettings();
  });

  // Plot mode settings
  $(document).on('change', '#neurocore-s-plot-enabled', function () {
    neuro.settings.plotModeEnabled = $(this).is(':checked');
    console.log('[NeuroCore] Plot mode:', neuro.settings.plotModeEnabled ? 'ON' : 'OFF');
    saveSettings();
  });
  $(document).on('change', '#neurocore-s-plot-keep', function () {
    neuro.settings.plotKeepRecentMessages = parseInt($(this).val()) || 4;
    saveSettings();
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
  $('#neurocore-s-plot-enabled').prop('checked', neuro.settings.plotModeEnabled);
  $('#neurocore-s-plot-keep').val(neuro.settings.plotKeepRecentMessages);


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

function syncDeletedMessages() {
  // Find episodes in DB whose external_id no longer exists in the chat
  const context = SillyTavern.getContext();
  const chat = context.chat;
  if (!chat) return 0;

  // Build set of all current send_dates
  const currentIds = new Set();
  for (let i = 0; i < chat.length; i++) {
    const id = getMessageExternalId(chat[i], i);
    currentIds.add(id);
  }

  // Find episodes with external_id that's no longer in chat
  const allEpisodes = neuro.db.all('SELECT id, external_id FROM episodes WHERE external_id IS NOT NULL');
  let removed = 0;
  for (const ep of allEpisodes) {
    if (!currentIds.has(ep.external_id)) {
      neuro.hippocampus.deleteEpisode(ep.id);
      removed++;
    }
  }

  if (removed > 0) {
    console.log('[NeuroCore] Removed %d orphaned episodes (deleted messages)', removed);
  }
  return removed;
}

async function onConsolidate() {
  console.log('[NeuroCore] Consolidate button clicked, isInitialized:', isInitialized, 'db:', !!neuro.db);
  if (!neuro.db) {
    console.warn('[NeuroCore] Cannot consolidate — database not initialized');
    return;
  }
  try {
    // 1. Remove episodes for deleted messages
    const removed = syncDeletedMessages();

    // 2. Import any new messages not yet in the DB
    const imported = await importExistingChat();

    if (removed > 0 || imported > 0) {
      console.log('[NeuroCore] Sync: +%d imported, -%d removed', imported, removed);
    }

    // 3. Run consolidation
    const msgCount = neuro.db.getMessageCount();
    console.log('[NeuroCore] Running consolidation, message count:', msgCount);
    await neuro.consolidation.runFullCycle(msgCount);
    await neuro.db.save();
    console.log('[NeuroCore] Consolidation complete');
    // Force rebuild of injection with updated semantic data
    neuro.lastPromptInjection = '';
    neuro.rebuildInjection();
    updateExtensionPrompt();
    refreshDashboard();
  } catch (err) {
    console.error('[NeuroCore] Consolidation failed:', err);
  }
}

function onShowInjection() {
  const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  const maxCtx = ctx?.maxContext || 4096;
  const container = $('#neurocore-injection-content');
  const meta = $('#neurocore-popup-meta');
  const popup = $('#neurocore-injection-popup');

  if (neuro.settings.plotModeEnabled && neuro.plotGenerator?.lastPlot) {
    // Plot mode: show the generated plot
    const plotText = neuro.plotGenerator.lastPlot;
    const tokens = neuro.pfc.estimateTokens(plotText);
    container.text(plotText);
    meta.html(
      `<span style="color: #4fc3f7;">PLOT-MODUS AKTIV</span>` +
      `<span>~${tokens} Tokens (Plot)</span>` +
      `<span>Letzte ${neuro.settings.plotKeepRecentMessages} echte Nachrichten werden beibehalten</span>`
    );
  } else {
    // Normal mode: show memory injection
    const injection = neuro.getPromptInjection(maxCtx);
    if (!injection.trim()) {
      container.text('(Noch kein Memory-Prompt generiert. Sende zuerst eine Nachricht.)');
      meta.html('');
    } else {
      container.text(injection);
      const tokens = neuro.pfc.estimateTokens(injection);
      const rawTokens = neuro.pfc.estimateTokens(neuro.lastPromptInjection || '');
      const budget = Math.floor(maxCtx * (neuro.settings.tokenBudgetPercent / 100));
      meta.html(
        `<span>~${tokens} Tokens (roh: ~${rawTokens})</span>` +
        `<span>Budget: ${budget} / ${maxCtx} (${neuro.settings.tokenBudgetPercent}%)</span>` +
        `<span>Slots: ${neuro.settings.maxSlots}</span>`
      );
    }
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
    updateExtensionPrompt();
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

    updateExtensionPrompt();
    refreshDashboard();
    console.log('[NeuroCore] Switched to chat:', newChatId, '- imported', imported, 'messages');
  } catch (err) {
    console.error('[NeuroCore] Error switching chat:', err);
  }
}

function onMessageDeleted(messageIndex) {
  if (!isInitialized) return;
  console.log('[NeuroCore] message_deleted fired, index:', messageIndex);

  // Try via in-memory map first
  let episodeId = messageEpisodeMap.get(messageIndex);

  // Fallback: look up via external_id in DB (works after reload)
  if (!episodeId) {
    const context = SillyTavern.getContext();
    const msg = context.chat?.[messageIndex];
    if (msg) {
      const externalId = getMessageExternalId(msg, messageIndex);
      const ep = neuro.hippocampus.getEpisodeByExternalId(externalId);
      if (ep) episodeId = ep.id;
    }
  }

  if (episodeId) {
    neuro.handleMessageDeleted(episodeId);
    messageEpisodeMap.delete(messageIndex);
    neuro.db.save();
    refreshDashboard();
    console.log('[NeuroCore] Deleted episode:', episodeId);
  }
}

async function onMessageUpdated(messageIndex) {
  if (!isInitialized) return;
  try {
    const context = SillyTavern.getContext();
    const msg = context.chat?.[messageIndex];
    if (!msg) return;

    console.log('[NeuroCore] message_updated fired, index:', messageIndex);
    const newText = msg.mes || '';
    const externalId = getMessageExternalId(msg, messageIndex);

    // Try via in-memory map first
    let episodeId = messageEpisodeMap.get(messageIndex);

    // Fallback: look up via external_id in DB
    if (!episodeId) {
      const ep = neuro.hippocampus.getEpisodeByExternalId(externalId);
      if (ep) episodeId = ep.id;
    }

    if (episodeId) {
      // Update the episode content + keywords
      neuro.hippocampus.updateEpisodeContent(episodeId, newText);
      // Re-analyze emotions
      const emotional = neuro.amygdala.analyze(newText);
      neuro.db.run('UPDATE episodes SET emotional_valence = ? WHERE id = ?',
        [emotional.valence, episodeId]);
      // Clear old emotional tags and re-create
      neuro.db.run('DELETE FROM emotional_tags WHERE episode_id = ?', [episodeId]);
      neuro.amygdala.saveEmotionalTags(neuro.db, episodeId, emotional.emotions);

      await neuro.db.save();
      refreshDashboard();
      console.log('[NeuroCore] Updated episode:', episodeId);
    } else {
      // Message was edited but we don't have it yet — import it
      const sender = msg.is_user ? 'user' : (msg.name || 'character');
      const epId = await neuro.processMessage(newText, sender, messageIndex, externalId);
      messageEpisodeMap.set(messageIndex, epId);
      await neuro.db.save();
      refreshDashboard();
      console.log('[NeuroCore] Imported edited message as new episode:', epId);
    }
  } catch (err) {
    console.error('[NeuroCore] Error updating message:', err);
  }
}

function updateExtensionPrompt() {
  // Push current injection into ST's extension prompt system
  try {
    const ctx = SillyTavern.getContext();
    const maxCtx = ctx.maxContext || 4096;
    const injection = neuro.getPromptInjection(maxCtx);
    if (injection && injection.trim()) {
      ctx.setExtensionPrompt(MODULE_NAME, injection, 1, 0);
      console.log('[NeuroCore] Extension prompt updated, length:', injection.length);
    } else {
      // Clear any previous injection if nothing to inject
      ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0);
      console.log('[NeuroCore] Extension prompt cleared (empty injection)');
    }
  } catch (err) {
    console.error('[NeuroCore] Failed to update extension prompt:', err);
  }
}

// Holds the generated plot messages for injection into chat completion
let pendingPlotMessages = null;

function registerPromptHook(context) {
  const eventSource = context.eventSource;
  const eventTypes = context.eventTypes || context.event_types;
  if (!eventSource || !eventTypes) return;

  // --- Phase 1: Before prompt assembly — process message + generate plot ---
  eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, async () => {
    console.log('[NeuroCore] GENERATE_BEFORE_COMBINE_PROMPTS fired');
    pendingPlotMessages = null;

    // Process the latest user message if not yet processed
    let lastUserMessage = '';
    try {
      const ctx = SillyTavern.getContext();
      const chat = ctx.chat;
      if (chat && chat.length > 0) {
        for (let i = chat.length - 1; i >= 0; i--) {
          const msg = chat[i];
          if (!msg.is_user) continue;
          const text = msg.mes || '';
          if (!text.trim()) break;

          lastUserMessage = text;
          const externalId = getMessageExternalId(msg, i);
          if (!neuro.hippocampus.hasEpisodeByExternalId(externalId)) {
            console.log('[NeuroCore] Processing user message before generate, index:', i);
            const episodeId = await neuro.processMessage(text, 'user', i, externalId);
            messageEpisodeMap.set(i, episodeId);
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[NeuroCore] Pre-generate message processing failed:', err);
    }

    // Generate plot if plot mode is enabled
    if (neuro.settings.plotModeEnabled && neuro.plotGenerator) {
      try {
        console.log('[NeuroCore] Plot mode active — generating plot summary...');
        pendingPlotMessages = await neuro.plotGenerator.generate(lastUserMessage);
        if (pendingPlotMessages) {
          console.log('[NeuroCore] Plot generated, messages:', pendingPlotMessages.length);
        }
      } catch (err) {
        console.error('[NeuroCore] Plot generation failed:', err);
      }
    }

    // Update extension prompt (for non-plot injection or fallback)
    if (!neuro.settings.plotModeEnabled) {
      updateExtensionPrompt();
    }
  });

  // --- Phase 2: After prompt assembly — replace history with plot ---
  eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, (eventData) => {
    if (!neuro.settings.plotModeEnabled || !pendingPlotMessages || eventData.dryRun) return;

    const chat = eventData.chat;
    if (!chat || !Array.isArray(chat)) return;

    console.log('[NeuroCore] CHAT_COMPLETION_PROMPT_READY — replacing history with plot');
    console.log('[NeuroCore] Original chat messages:', chat.length);

    // Identify which messages are "history" (user/assistant role, not system)
    // Keep: system messages (character card, jailbreak, extensions) + last N user/assistant
    const keepRecent = neuro.settings.plotKeepRecentMessages || 4;

    // Find all user/assistant message indices
    const historyIndices = [];
    for (let i = 0; i < chat.length; i++) {
      if (chat[i].role === 'user' || chat[i].role === 'assistant') {
        historyIndices.push(i);
      }
    }

    // Keep the last N history messages, remove the rest
    const toKeep = new Set(historyIndices.slice(-keepRecent));
    const toRemove = historyIndices.filter(i => !toKeep.has(i));

    if (toRemove.length === 0) {
      console.log('[NeuroCore] Not enough history to replace, skipping plot injection');
      return;
    }

    // Find where to insert the plot (before the first kept message)
    const firstKeptIdx = historyIndices.length > keepRecent
      ? historyIndices[historyIndices.length - keepRecent]
      : historyIndices[0];

    // Remove old history messages (from end to start to preserve indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      chat.splice(toRemove[i], 1);
    }

    // Find the new insertion point (after system messages, before kept history)
    let insertAt = 0;
    for (let i = 0; i < chat.length; i++) {
      if (chat[i].role === 'user' || chat[i].role === 'assistant') {
        insertAt = i;
        break;
      }
    }

    // Insert plot messages
    for (let i = pendingPlotMessages.length - 1; i >= 0; i--) {
      chat.splice(insertAt, 0, pendingPlotMessages[i]);
    }

    console.log('[NeuroCore] History replaced. Removed:', toRemove.length,
      'messages. Kept:', keepRecent, 'recent. Injected:', pendingPlotMessages.length,
      'plot messages. Final chat:', chat.length);

    // Clear pending
    pendingPlotMessages = null;
  });

  console.log('[NeuroCore] Prompt hooks registered (GENERATE_BEFORE_COMBINE_PROMPTS + CHAT_COMPLETION_PROMPT_READY)');
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

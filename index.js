// index.js — SillyTavern Extension Entry Point
// Hooks into ST events and wires them to NeuroController

import { NeuroController } from './core/NeuroController.js';

const MODULE_NAME = 'neurocore';
const neuro = new NeuroController();

// Maps ST message index → NeuroCore episode ID
const messageEpisodeMap = new Map();

let currentChatId = null;
let isInitialized = false;

// --- SillyTavern Extension API ---

async function initExtension() {
  // ST context
  const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
  if (!context) {
    console.warn('[NeuroCore] SillyTavern context not available');
    return;
  }

  const chatId = getChatId(context);
  if (!chatId) return;

  currentChatId = chatId;

  // LLM callback for consolidation summaries (optional)
  const llmCallback = async (text) => {
    if (typeof context.generateQuietPrompt === 'function') {
      return context.generateQuietPrompt(
        `Fasse die folgenden Ereignisse in 1-2 Sätzen zusammen. Behalte die Sprache bei:\n\n${text}`
      );
    }
    return null;
  };

  await neuro.initialize(chatId, {}, llmCallback);
  isInitialized = true;

  // Register event listeners
  if (context.eventSource) {
    context.eventSource.on('message_received', onMessageReceived);
    context.eventSource.on('chatLoaded', onChatChanged);
    context.eventSource.on('messageDeleted', onMessageDeleted);
    context.eventSource.on('messageUpdated', onMessageUpdated);
  }

  // Register prompt injection hook
  if (typeof context.setExtensionPrompt === 'function') {
    // This will be called each time before prompt assembly
    registerPromptHook(context);
  }

  console.log('[NeuroCore] Extension initialized for chat:', chatId);
}

function getChatId(context) {
  if (context.chatId) return context.chatId;
  if (context.characters && context.characterIndex >= 0) {
    return `char-${context.characters[context.characterIndex]?.avatar || 'unknown'}`;
  }
  return null;
}

// --- Event Handlers ---

async function onMessageReceived(messageIndex) {
  if (!isInitialized) return;
  try {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageIndex]) return;

    const msg = chat[messageIndex];
    const sender = msg.is_user ? 'user' : (msg.name || 'character');
    const text = msg.mes || '';

    if (!text.trim()) return;

    const episodeId = await neuro.processMessage(text, sender, messageIndex);
    messageEpisodeMap.set(messageIndex, episodeId);
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

    const llmCallback = async (text) => {
      if (typeof context.generateQuietPrompt === 'function') {
        return context.generateQuietPrompt(
          `Fasse die folgenden Ereignisse in 1-2 Sätzen zusammen. Behalte die Sprache bei:\n\n${text}`
        );
      }
      return null;
    };

    await neuro.switchChat(newChatId, llmCallback);
    console.log('[NeuroCore] Switched to chat:', newChatId);
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
  // Use GENERATE_BEFORE_COMBINE to inject memory context
  if (context.eventSource) {
    context.eventSource.on('generate_before_combine', () => {
      const injection = neuro.getPromptInjection(context.maxContext || 4096);
      if (injection && injection.trim()) {
        context.setExtensionPrompt(MODULE_NAME, injection, 1, 0);
      }
    });
  }
}

// --- Dashboard API (exposed for UI) ---

export function getNeuroController() {
  return neuro;
}

export function getMessageEpisodeMap() {
  return messageEpisodeMap;
}

// --- Extension lifecycle ---

// SillyTavern calls jQuery(async () => {}) for extension init
if (typeof jQuery !== 'undefined') {
  jQuery(async () => {
    await initExtension();
  });
} else if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    await initExtension();
  });
}

export { neuro, MODULE_NAME };

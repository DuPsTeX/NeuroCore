// core/NeuroController.js — Orchestrates all regions + processes
import { NeuralBus, SIGNALS } from './NeuralBus.js';
import { BrainDatabase } from './storage/BrainDatabase.js';
import { Hippocampus } from './regions/Hippocampus.js';
import { PrefrontalCortex } from './regions/PrefrontalCortex.js';
import { Amygdala } from './regions/Amygdala.js';
import { Cerebellum } from './regions/Cerebellum.js';
import { TemporalLobe } from './regions/TemporalLobe.js';
import { BasalGanglia } from './regions/BasalGanglia.js';
import { DecayEngine } from './processes/DecayEngine.js';
import { SpreadingActivation } from './processes/SpreadingActivation.js';
import { Consolidation } from './processes/Consolidation.js';
import { Reconsolidation } from './processes/Reconsolidation.js';
import { PlotGenerator } from './processes/PlotGenerator.js';
import { extractKeywords } from './KeywordExtractor.js';

const DEFAULT_SETTINGS = {
  maxSlots: 8,
  tokenBudgetPercent: 15,
  consolidationInterval: 10,
  inactivityTimeoutMs: 5 * 60 * 1000,
  plotModeEnabled: false,
  plotKeepRecentMessages: 4,
  plotCustomPrompt: '',
  plotMaxTokens: 4000,
};

export class NeuroController {
  constructor() {
    this.bus = new NeuralBus();
    this.db = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.inactivityTimer = null;
    this.lastPromptInjection = '';
  }

  async initialize(chatId, settings = {}, llmCallback = null) {
    Object.assign(this.settings, settings);

    this.db = new BrainDatabase();
    await this.db.open(chatId);

    // Instantiate regions
    this.amygdala = new Amygdala();
    this.hippocampus = new Hippocampus(this.db);
    this.temporalLobe = new TemporalLobe(this.db);
    this.pfc = new PrefrontalCortex({
      maxSlots: this.settings.maxSlots,
      tokenBudget: 2000,
    });
    this.cerebellum = new Cerebellum(this.db);
    this.basalGanglia = new BasalGanglia(this.db);

    // Instantiate processes
    this.spreadingActivation = new SpreadingActivation(this.temporalLobe);
    this.reconsolidation = new Reconsolidation();
    this.consolidation = new Consolidation({
      db: this.db,
      hippocampus: this.hippocampus,
      temporal: this.temporalLobe,
      cerebellum: this.cerebellum,
      basalGanglia: this.basalGanglia,
      generateSummary: llmCallback,
    });

    this.plotGenerator = new PlotGenerator({
      db: this.db,
      hippocampus: this.hippocampus,
      temporal: this.temporalLobe,
      cerebellum: this.cerebellum,
      basalGanglia: this.basalGanglia,
      amygdala: this.amygdala,
      pfc: this.pfc,
      generatePlot: llmCallback,
    });
    this.plotGenerator.settings = this.settings;

    this._resetInactivityTimer();
  }

  _resetInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(async () => {
      try {
        const msgCount = this.db.getMessageCount();
        await this.consolidation.runFullCycle(msgCount);
        await this.db.save();
      } catch (e) {
        console.error('[NeuroCore] Inactivity consolidation failed:', e.message);
      }
    }, this.settings.inactivityTimeoutMs);
  }

  async processMessage(messageText, sender, messageIndex, externalId = null) {
    const msgCount = this.db.incrementMessageCount();
    this._resetInactivityTimer();

    // 1. Emotional analysis
    const emotional = this.amygdala.analyze(messageText);

    // 2. Store episode (with deduplication via externalId)
    const episodeId = this.hippocampus.storeEpisode({
      content: messageText,
      participants: [sender],
      emotionalValence: emotional.valence,
      messageCount: msgCount,
      externalId,
    });
    this.amygdala.saveEmotionalTags(this.db, episodeId, emotional.emotions);

    // 3. Extract query keywords
    const queryKeywords = extractKeywords(messageText).map(k => k.word);

    // 4. Semantic search + spreading activation
    const semanticMatches = this.temporalLobe.findNodes(queryKeywords);
    const activatedNodes = new Map();
    for (const node of semanticMatches.slice(0, 3)) {
      const spread = this.spreadingActivation.activate(node.id);
      for (const [id, level] of spread) {
        const existing = activatedNodes.get(id) || 0;
        activatedNodes.set(id, Math.max(existing, level));
      }
    }

    // 5. Recall relevant episodes
    const episodes = this.hippocampus.recall(queryKeywords, msgCount, 20);

    // 6. Mark recalled episodes as labile
    for (const ep of episodes) {
      this.reconsolidation.markLabile(ep.id);
    }

    // 7. Check procedural patterns
    const patterns = this.cerebellum.matchPatterns(queryKeywords);
    for (const p of patterns) {
      this.cerebellum.activatePattern(p.id);
    }

    // 8. Gather semantic facts from activated nodes
    const semanticFacts = [];
    for (const [nodeId, activation] of activatedNodes) {
      if (activation > 0.3) {
        const node = this.db.get('SELECT * FROM semantic_nodes WHERE id = ?', [nodeId]);
        if (node) semanticFacts.push(node);
      }
    }

    // 9. Build prompt injection (standard mode — plot mode is handled by index.js hooks)
    this.lastPromptInjection = this.pfc.assemblePromptInjection({
      episodes: episodes.slice(0, this.settings.maxSlots),
      semanticFacts: semanticFacts.slice(0, 10),
      patterns: patterns.slice(0, 5),
      emotionalState: { currentValence: emotional.valence, emotions: emotional.emotions },
    });

    // 10. Stabilize reconsolidation
    this.reconsolidation.stabilizeAll();

    // 11. Periodic decay + consolidation
    if (msgCount % this.settings.consolidationInterval === 0) {
      DecayEngine.tick(this.db, msgCount);
      await this.consolidation.runFullCycle(msgCount);
    }

    // 12. DB size check
    const sizeBytes = this.db.getDbSizeBytes();
    if (sizeBytes > 50 * 1024 * 1024) {
      console.warn('[NeuroCore] DB over 50MB, aggressive pruning needed');
      DecayEngine.tick(this.db, msgCount, 0.3);
    }

    // 13. Persist
    await this.db.save();

    return episodeId;
  }

  /**
   * Build a fresh injection from current DB state (semantic nodes, recent episodes, patterns).
   * Called by getPromptInjection when lastPromptInjection is empty (e.g. after consolidation/chat switch).
   */
  rebuildInjection() {
    // Get recent episodes (most recent by timestamp, no keyword filter)
    const episodes = this.db.all(
      'SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?', [20]
    );

    // Get all semantic facts
    const allNodes = this.db.all('SELECT * FROM semantic_nodes WHERE confidence >= 0.3 ORDER BY confidence DESC LIMIT 20');

    // Get active patterns
    const patterns = this.db.all('SELECT * FROM procedural_patterns ORDER BY activation_count DESC LIMIT 5');

    // Get latest emotional state
    const latestEpisode = episodes[0];
    let emotionalState = null;
    if (latestEpisode) {
      const tags = this.db.all('SELECT * FROM emotional_tags WHERE episode_id = ?', [latestEpisode.id]);
      if (tags.length > 0) {
        emotionalState = { emotions: tags.map(t => ({ type: t.emotion, intensity: t.intensity })) };
      }
    }

    this.lastPromptInjection = this.pfc.assemblePromptInjection({
      episodes: episodes.slice(0, this.settings.maxSlots),
      semanticFacts: allNodes.slice(0, 10),
      patterns: patterns.slice(0, 5),
      emotionalState,
    });

    return this.lastPromptInjection;
  }

  getPromptInjection(maxContextTokens = 4096) {
    // Rebuild if empty (after consolidation, chat switch, or first call)
    if (!this.lastPromptInjection) {
      this.rebuildInjection();
    }

    const tokenBudget = Math.floor(maxContextTokens * (this.settings.tokenBudgetPercent / 100));
    const estimated = this.pfc.estimateTokens(this.lastPromptInjection);
    console.log('[NeuroCore] getPromptInjection — lastInjection length:', this.lastPromptInjection.length,
      'tokens:', estimated, 'budget:', tokenBudget);
    if (estimated > tokenBudget) {
      const ratio = tokenBudget / estimated;
      const chars = Math.floor(this.lastPromptInjection.length * ratio);
      return this.lastPromptInjection.slice(0, chars) + '\n[NeuroCore Memory Injection — ENDE]';
    }
    return this.lastPromptInjection;
  }

  async switchChat(newChatId, llmCallback = null) {
    await this.shutdown();
    await this.initialize(newChatId, this.settings, llmCallback);
  }

  handleMessageDeleted(episodeId) {
    if (episodeId) {
      this.hippocampus.deleteEpisode(episodeId);
    }
  }

  handleMessageEdited(episodeId, newText) {
    if (episodeId && this.reconsolidation) {
      this.reconsolidation.markLabile(episodeId);
      this.reconsolidation.update(episodeId, newText, this.hippocampus);
    }
  }

  async shutdown() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.db) {
      try {
        const msgCount = this.db.getMessageCount();
        await this.consolidation.runFullCycle(msgCount);
        await this.db.save();
      } catch (e) {
        console.error('[NeuroCore] Shutdown consolidation failed:', e.message);
      }
      this.db.close();
    }
  }

  getStatus() {
    if (!this.db) return null;
    return {
      hippocampus: { episodes: this.db.all('SELECT COUNT(*) as c FROM episodes')[0].c },
      temporalLobe: { nodes: this.db.all('SELECT COUNT(*) as c FROM semantic_nodes')[0].c },
      cerebellum: { patterns: this.db.all('SELECT COUNT(*) as c FROM procedural_patterns')[0].c },
      basalGanglia: { habits: this.db.all('SELECT COUNT(*) as c FROM habits')[0].c },
      messageCount: this.db.getMessageCount(),
      dbSizeBytes: this.db.getDbSizeBytes(),
      errors: this.bus.getErrors().length,
    };
  }
}

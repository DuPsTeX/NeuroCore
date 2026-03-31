// core/PlotGenerator.js — Plot Memory Generator
// Generiert intelligente Plot-Zusammenfassungen aus dem Gedächtnis
// um Token-Verbrauch zu reduzieren und relevanten Kontext bereitzustellen

import { extractKeywords } from './KeywordExtractor.js';

/**
 * PlotGenerator - Erstellt narrative Kontext-Zusammenfassungen aus Erinnerungen
 * 
 * Workflow:
 * 1. Sammelt relevante Erinnerungen aus verschiedenen Gehirnregionen
 * 2. Analysiert zeitliche und thematische Zusammenhänge
 * 3. Generiert kohärenten Plot mit LLM
 * 4. Ersetzt detaillierte Chat-History durch kompakte Story
 */
export class PlotGenerator {
  constructor({ 
    db, 
    hippocampus, 
    temporalLobe, 
    cerebellum, 
    basalGanglia,
    amygdala,
    spreadingActivation,
    llmCallback 
  }) {
    this.db = db;
    this.hippocampus = hippocampus;
    this.temporalLobe = temporalLobe;
    this.cerebellum = cerebellum;
    this.basalGanglia = basalGanglia;
    this.amygdala = amygdala;
    this.spreadingActivation = spreadingActivation;
    this.llmCallback = llmCallback;
    
    // Cache für generierten Plot
    this.cachedPlot = null;
    this.cachedPlotTimestamp = 0;
    this.cacheValidityMs = 30000; // 30 Sekunden
  }

  /**
   * Hauptmethode: Generiert Plot-Memory aus aktuellen Erinnerungen
   * @param {string[]} queryKeywords - Keywords der aktuellen User-Nachricht
   * @param {number} currentMessageCount - Aktuelle Nachrichtenzahl
   * @param {Object} options - Zusätzliche Optionen
   * @returns {Promise<string>} Generierter Plot
   */
  async generatePlot(queryKeywords, currentMessageCount, options = {}) {
    const {
      maxEpisodes = 20,
      maxSemanticNodes = 15,
      maxPatterns = 5,
      includeEmotionalArc = true,
      timeSpanMessages = 100, // Wie weit zurück schauen wir?
    } = options;

    console.log('[PlotGenerator] Generating plot memory for keywords:', queryKeywords);

    // 1. Sammle relevante Daten aus allen Regionen
    const memoryData = await this._gatherMemoryData({
      queryKeywords,
      currentMessageCount,
      maxEpisodes,
      maxSemanticNodes,
      maxPatterns,
      timeSpanMessages,
    });

    // 2. Analysiere Zusammenhänge und Struktur
    const structure = this._analyzeStructure(memoryData, queryKeywords);

    // 3. Generiere Plot mit LLM
    const plot = await this._generatePlotWithLLM(memoryData, structure, {
      includeEmotionalArc,
      currentKeywords: queryKeywords,
    });

    // 4. Cache für kurze Zeit
    this.cachedPlot = plot;
    this.cachedPlotTimestamp = Date.now();

    console.log('[PlotGenerator] Plot generated, length:', plot.length, 'chars');
    return plot;
  }

  /**
   * Sammelt alle relevanten Erinnerungen aus den Gehirnregionen
   */
  async _gatherMemoryData(options) {
    const {
      queryKeywords,
      currentMessageCount,
      maxEpisodes,
      maxSemanticNodes,
      maxPatterns,
      timeSpanMessages,
    } = options;

    // 1. Episodische Erinnerungen (Hippocampus)
    // Kombiniere keyword-basierte Suche mit zeitlicher Nähe
    const recentEpisodes = this.hippocampus.recall(
      queryKeywords, 
      currentMessageCount, 
      maxEpisodes
    );

    // Füge auch einige alte, hochrelevante Erinnerungen hinzu
    const oldSignificantEpisodes = this._findOldSignificantMemories(
      currentMessageCount, 
      timeSpanMessages
    );

    const allEpisodes = this._mergeAndRankEpisodes(
      recentEpisodes, 
      oldSignificantEpisodes,
      queryKeywords,
      maxEpisodes
    );

    // 2. Semantisches Wissen (Temporal Lobe)
    const semanticNodes = this._gatherSemanticKnowledge(
      queryKeywords, 
      maxSemanticNodes
    );

    // 3. Verhaltensmuster (Cerebellum)
    const patterns = this.cerebellum.matchPatterns(queryKeywords)
      .slice(0, maxPatterns);

    // 4. Gewohnheiten und Routinen (Basal Ganglia)
    const habits = this._getRelevantHabits(queryKeywords, 5);

    // 5. Emotionale Themen (Amygdala)
    const emotionalThemes = this._extractEmotionalThemes(allEpisodes);

    return {
      episodes: allEpisodes,
      semanticNodes,
      patterns,
      habits,
      emotionalThemes,
      timeRange: {
        oldest: allEpisodes.length > 0 ? 
          Math.min(...allEpisodes.map(e => e.decay_base_time)) : 
          currentMessageCount,
        newest: currentMessageCount,
      },
    };
  }

  /**
   * Findet alte, aber signifikante Erinnerungen
   * (hohe emotionale Valenz, viele Abrufe, oder konsolidiert)
   */
  _findOldSignificantMemories(currentMessageCount, timeSpanMessages) {
    const oldThreshold = currentMessageCount - timeSpanMessages;
    
    return this.db.all(
      `SELECT * FROM episodes 
       WHERE decay_base_time < ?
       AND (
         emotional_valence > 0.7 
         OR retrieval_count > 5 
         OR consolidated = 1
       )
       ORDER BY 
         (emotional_valence * 0.4 + retrieval_count * 0.01 + consolidated * 0.3) DESC
       LIMIT 10`,
      [oldThreshold]
    );
  }

  /**
   * Merged und rankt Episoden nach Relevanz
   */
  _mergeAndRankEpisodes(recent, old, queryKeywords, maxEpisodes) {
    // Deduplizierung
    const seen = new Set();
    const merged = [];

    for (const ep of [...recent, ...old]) {
      if (seen.has(ep.id)) continue;
      seen.add(ep.id);
      
      // Berechne finale Relevanz-Score
      ep._relevanceScore = this._computeEpisodeRelevance(ep, queryKeywords);
      merged.push(ep);
    }

    // Sortiere nach Relevanz
    merged.sort((a, b) => b._relevanceScore - a._relevanceScore);
    
    return merged.slice(0, maxEpisodes);
  }

  /**
   * Berechnet Relevanz-Score für eine Episode
   */
  _computeEpisodeRelevance(episode, queryKeywords) {
    const keywords = JSON.parse(episode.keywords || '[]');
    const matches = keywords.filter(k => 
      queryKeywords.some(qk => qk.toLowerCase() === k.toLowerCase())
    ).length;
    
    const keywordScore = queryKeywords.length > 0 ? 
      matches / queryKeywords.length : 0;
    
    const emotionalScore = episode.emotional_valence || 0;
    const retrievalScore = Math.min(episode.retrieval_count / 10, 1.0);
    const consolidationBonus = episode.consolidated ? 0.2 : 0;
    
    return (keywordScore * 0.4) + 
           (emotionalScore * 0.3) + 
           (retrievalScore * 0.2) + 
           consolidationBonus;
  }

  /**
   * Sammelt relevantes semantisches Wissen mit Spreading Activation
   */
  _gatherSemanticKnowledge(queryKeywords, maxNodes) {
    // 1. Direkte Keyword-Matches
    const directMatches = this.temporalLobe.findNodes(queryKeywords);
    
    // 2. Spreading Activation von Top-Matches
    const activated = new Map();
    for (const node of directMatches.slice(0, 5)) {
      const spread = this.spreadingActivation.activate(node.id, 2); // 2 Hops
      for (const [id, level] of spread) {
        const existing = activated.get(id) || 0;
        activated.set(id, Math.max(existing, level));
      }
    }

    // 3. Hole aktivierte Nodes und sortiere nach Aktivierung
    const nodes = [];
    for (const [nodeId, activation] of activated) {
      const node = this.db.get('SELECT * FROM semantic_nodes WHERE id = ?', [nodeId]);
      if (node && activation > 0.2) {
        node._activation = activation;
        nodes.push(node);
      }
    }

    nodes.sort((a, b) => b._activation - a._activation);
    return nodes.slice(0, maxNodes);
  }

  /**
   * Findet relevante Gewohnheiten
   */
  _getRelevantHabits(queryKeywords, limit) {
    if (queryKeywords.length === 0) {
      return this.db.all(
        'SELECT * FROM habits ORDER BY strength DESC LIMIT ?',
        [limit]
      );
    }

    const keywordPattern = queryKeywords.map(k => `%${k}%`).join('|');
    return this.db.all(
      `SELECT * FROM habits 
       WHERE context LIKE ? OR behavior LIKE ?
       ORDER BY strength DESC 
       LIMIT ?`,
      [keywordPattern, keywordPattern, limit]
    );
  }

  /**
   * Extrahiert emotionale Themen aus Episoden
   */
  _extractEmotionalThemes(episodes) {
    const themes = {
      positive: [],
      negative: [],
      intense: [],
      neutral: [],
    };

    for (const ep of episodes) {
      const valence = ep.emotional_valence || 0;
      
      // Hole emotionale Tags
      const tags = this.db.all(
        'SELECT * FROM emotional_tags WHERE episode_id = ?',
        [ep.id]
      );

      const emotionSummary = {
        episodeId: ep.id,
        valence,
        emotions: tags.map(t => ({ type: t.emotion, intensity: t.intensity })),
        content: ep.content.slice(0, 100), // Kurzer Auszug
      };

      if (valence > 0.7) themes.intense.push(emotionSummary);
      else if (valence > 0.5) themes.positive.push(emotionSummary);
      else if (valence < 0.3) themes.negative.push(emotionSummary);
      else themes.neutral.push(emotionSummary);
    }

    return themes;
  }

  /**
   * Analysiert die Struktur der Erinnerungen
   * (zeitlicher Verlauf, Themen-Cluster, Charaktere, etc.)
   */
  _analyzeStructure(memoryData, queryKeywords) {
    const { episodes, semanticNodes } = memoryData;

    // 1. Zeitliche Struktur
    const timeline = this._buildTimeline(episodes);

    // 2. Charakter-Analyse
    const characters = semanticNodes.filter(n => n.type === 'character');

    // 3. Locations
    const locations = semanticNodes.filter(n => n.type === 'location');

    // 4. Zentrale Themen/Konzepte
    const concepts = semanticNodes.filter(n => n.type === 'concept');

    // 5. Wichtige Ereignisse
    const events = semanticNodes.filter(n => n.type === 'event');

    return {
      timeline,
      characters,
      locations,
      concepts,
      events,
      thematicClusters: this._clusterByTheme(episodes),
    };
  }

  /**
   * Baut eine Timeline aus Episoden
   */
  _buildTimeline(episodes) {
    const sorted = [...episodes].sort((a, b) => 
      a.decay_base_time - b.decay_base_time
    );

    // Gruppiere in zeitliche Abschnitte
    const segments = [];
    let currentSegment = [];
    let lastTime = 0;

    for (const ep of sorted) {
      // Neues Segment wenn mehr als 20 Nachrichten Abstand
      if (currentSegment.length > 0 && 
          ep.decay_base_time - lastTime > 20) {
        segments.push([...currentSegment]);
        currentSegment = [];
      }
      currentSegment.push(ep);
      lastTime = ep.decay_base_time;
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Clustert Episoden nach Themen (Keywords)
   */
  _clusterByTheme(episodes) {
    const clusters = new Map();

    for (const ep of episodes) {
      const keywords = JSON.parse(ep.keywords || '[]');
      const mainKeyword = keywords[0]; // Hauptthema

      if (!mainKeyword) continue;

      if (!clusters.has(mainKeyword)) {
        clusters.set(mainKeyword, []);
      }
      clusters.get(mainKeyword).push(ep);
    }

    // Sortiere Cluster nach Größe
    return Array.from(clusters.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5); // Top 5 Themen
  }

  /**
   * Generiert Plot mit LLM
   */
  async _generatePlotWithLLM(memoryData, structure, options) {
    if (!this.llmCallback) {
      // Fallback: Einfache Text-Zusammenfassung ohne LLM
      return this._generateSimplePlot(memoryData, structure);
    }

    const { includeEmotionalArc, currentKeywords } = options;
    const { episodes, semanticNodes, patterns, emotionalThemes } = memoryData;
    const { timeline, characters, locations, concepts } = structure;

    // Baue Prompt für LLM
    const prompt = this._buildPlotGenerationPrompt({
      episodes,
      semanticNodes,
      patterns,
      emotionalThemes,
      timeline,
      characters,
      locations,
      concepts,
      includeEmotionalArc,
      currentKeywords,
    });

    try {
      console.log('[PlotGenerator] Calling LLM for plot generation...');
      const llmResponse = await this.llmCallback(prompt);
      
      if (!llmResponse || llmResponse.trim().length < 50) {
        console.warn('[PlotGenerator] LLM response too short, using fallback');
        return this._generateSimplePlot(memoryData, structure);
      }

      return this._formatPlotOutput(llmResponse);
    } catch (error) {
      console.error('[PlotGenerator] LLM call failed:', error);
      return this._generateSimplePlot(memoryData, structure);
    }
  }

  /**
   * Baut den Prompt für Plot-Generierung
   */
  _buildPlotGenerationPrompt(data) {
    const {
      episodes,
      characters,
      locations,
      concepts,
      timeline,
      emotionalThemes,
      patterns,
      currentKeywords,
    } = data;

    const lines = [
      'Du bist ein Story-Analyst. Erstelle eine KOMPAKTE narrative Zusammenfassung aus folgenden Erinnerungsfragmenten.',
      '',
      '**WICHTIG**: Deine Antwort muss DEUTLICH kürzer sein als die Rohdaten. Fokussiere auf die Essenz.',
      '',
      '## Aktuelle Gesprächsthemen:',
      currentKeywords.length > 0 ? currentKeywords.join(', ') : '(allgemein)',
      '',
    ];

    // Charaktere
    if (characters.length > 0) {
      lines.push('## Bekannte Charaktere:');
      for (const char of characters.slice(0, 5)) {
        const props = JSON.parse(char.properties || '{}');
        const propsStr = Object.entries(props)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        lines.push(`- ${char.label}${propsStr ? ' (' + propsStr + ')' : ''}`);
      }
      lines.push('');
    }

    // Locations
    if (locations.length > 0) {
      lines.push('## Orte:');
      for (const loc of locations.slice(0, 3)) {
        lines.push(`- ${loc.label}`);
      }
      lines.push('');
    }

    // Timeline - nur die wichtigsten Momente
    if (timeline.length > 0) {
      lines.push('## Wichtige Erinnerungs-Momente:');
      let momentCount = 0;
      for (const segment of timeline.slice(0, 3)) {
        // Zeige nur die emotional intensivsten aus jedem Segment
        const topEpisode = segment
          .sort((a, b) => (b.emotional_valence || 0) - (a.emotional_valence || 0))[0];
        
        if (topEpisode && momentCount < 8) {
          const content = topEpisode.content.length > 150 ?
            topEpisode.content.slice(0, 150) + '...' :
            topEpisode.content;
          lines.push(`- ${content}`);
          momentCount++;
        }
      }
      lines.push('');
    }

    // Emotionale Themen
    if (emotionalThemes.intense.length > 0 || emotionalThemes.positive.length > 0) {
      lines.push('## Emotionale Highlights:');
      for (const theme of [...emotionalThemes.intense, ...emotionalThemes.positive].slice(0, 3)) {
        lines.push(`- ${theme.content}...`);
      }
      lines.push('');
    }

    // Konzepte und Themen
    if (concepts.length > 0) {
      lines.push('## Relevante Konzepte:');
      lines.push(concepts.slice(0, 5).map(c => c.label).join(', '));
      lines.push('');
    }

    // Verhaltensmuster
    if (patterns.length > 0) {
      lines.push('## Bekannte Muster:');
      for (const p of patterns.slice(0, 3)) {
        lines.push(`- ${p.trigger_desc} → ${p.response}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('**AUFGABE**: Erstelle eine narrative Zusammenfassung (Plot-Memory) die:');
    lines.push('1. Die wichtigsten Entwicklungen und Ereignisse beschreibt');
    lines.push('2. Charaktere und ihre Beziehungen erwähnt');
    lines.push('3. Den emotionalen Verlauf skizziert');
    lines.push('4. Relevantes Wissen für das aktuelle Thema einbindet');
    lines.push('5. MAXIMAL 300 Wörter lang ist');
    lines.push('');
    lines.push('**FORMAT**: Schreibe in 2-3 kurzen Absätzen. Nutze Markdown (**, ##). Sei präzise.');

    return lines.join('\n');
  }

  /**
   * Einfache Plot-Generierung ohne LLM (Fallback)
   */
  _generateSimplePlot(memoryData, structure) {
    const { episodes, semanticNodes } = memoryData;
    const { characters, locations, concepts } = structure;

    const lines = ['[NeuroCore Plot Memory — START]', ''];

    // Charaktere
    if (characters.length > 0) {
      lines.push('## Charaktere:');
      for (const char of characters.slice(0, 5)) {
        lines.push(`- ${char.label}`);
      }
      lines.push('');
    }

    // Wichtige Momente
    if (episodes.length > 0) {
      lines.push('## Wichtige Momente:');
      const topEpisodes = episodes
        .sort((a, b) => b._relevanceScore - a._relevanceScore)
        .slice(0, 5);
      
      for (const ep of topEpisodes) {
        const content = ep.content.length > 100 ?
          ep.content.slice(0, 100) + '...' :
          ep.content;
        lines.push(`- ${content}`);
      }
      lines.push('');
    }

    // Konzepte
    if (concepts.length > 0) {
      lines.push('## Themen: ' + concepts.slice(0, 5).map(c => c.label).join(', '));
      lines.push('');
    }

    // Locations
    if (locations.length > 0) {
      lines.push('## Orte: ' + locations.slice(0, 3).map(l => l.label).join(', '));
      lines.push('');
    }

    lines.push('[NeuroCore Plot Memory — ENDE]');
    return lines.join('\n');
  }

  /**
   * Formatiert LLM Output
   */
  _formatPlotOutput(llmResponse) {
    // Entferne mögliche Markdown Code Blocks
    let cleaned = llmResponse.trim();
    cleaned = cleaned.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
    
    return `[NeuroCore Plot Memory — START]\n\n${cleaned}\n\n[NeuroCore Plot Memory — ENDE]`;
  }

  /**
   * Prüft ob der Cache noch gültig ist
   */
  isCacheValid() {
    if (!this.cachedPlot) return false;
    return (Date.now() - this.cachedPlotTimestamp) < this.cacheValidityMs;
  }

  /**
   * Gibt gecachten Plot zurück
   */
  getCachedPlot() {
    return this.isCacheValid() ? this.cachedPlot : null;
  }

  /**
   * Invalidiert den Cache
   */
  invalidateCache() {
    this.cachedPlot = null;
    this.cachedPlotTimestamp = 0;
  }
}

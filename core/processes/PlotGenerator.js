// core/processes/PlotGenerator.js — Generates context analysis from brain memory
// Analyzes current situation, involved characters, and story connections for AI context

export class PlotGenerator {
  constructor({ db, hippocampus, temporal, cerebellum, basalGanglia, amygdala, pfc, generatePlot = null }) {
    this.db = db;
    this.hippo = hippocampus;
    this.temporal = temporal;
    this.cerebellum = cerebellum;
    this.basalGanglia = basalGanglia;
    this.amygdala = amygdala;
    this.pfc = pfc;
    this.generatePlot = generatePlot; // LLM callback for plot generation
    this.settings = null; // Reference to neuro.settings (set externally)
    this.lastPlot = '';
    this.lastPlotTimestamp = 0;
    this.plotCacheDuration = 0; // 0 = regenerate every time
  }

  /**
   * Generate a context analysis from brain memory, tailored to the current user message.
   * Returns a formatted injection string for use with setExtensionPrompt.
   */
  async generate(currentUserMessage) {
    if (!this.generatePlot || !this.db) return null;

    try {
      // 1. Gather all context from the brain
      const context = this._gatherBrainContext(currentUserMessage);

      // 2. Build the plot generation prompt
      const prompt = this._buildPlotPrompt(context, currentUserMessage);

      // 3. Call LLM to generate the context analysis
      const maxTokens = this.settings?.plotMaxTokens || 4000;
      console.log('[NeuroCore PlotGen] Generating context analysis (max tokens:', maxTokens, ')...');
      const plotText = await this.generatePlot(prompt, maxTokens);

      if (!plotText) {
        console.warn('[NeuroCore PlotGen] LLM returned empty plot');
        return null;
      }

      // 4. Clean up the analysis text
      this.lastPlot = this._cleanPlot(plotText);
      this.lastPlotTimestamp = Date.now();

      console.log('[NeuroCore PlotGen] Context analysis generated, length:', this.lastPlot.length, 'chars');

      // 5. Format as injection string
      return this._formatAsInjection(this.lastPlot);
    } catch (err) {
      console.error('[NeuroCore PlotGen] Plot generation failed:', err);
      return null;
    }
  }

  /**
   * Gather all relevant context from the brain's regions.
   */
  _gatherBrainContext(currentMessage) {
    const ctx = {};

    // Recent episodes (last 30 for chronological story coverage)
    ctx.episodes = this.db.all(
      'SELECT * FROM episodes ORDER BY timestamp DESC LIMIT 30'
    );

    // Consolidated memory clusters (compressed older memories)
    ctx.consolidated = this.db.all(
      `SELECT * FROM consolidated_memories ORDER BY importance DESC LIMIT 10`
    );

    // All semantic nodes (characters, locations, items)
    ctx.characters = this.db.all(
      "SELECT * FROM semantic_nodes WHERE type = 'character' AND confidence >= 0.3 ORDER BY confidence DESC LIMIT 15"
    );
    ctx.locations = this.db.all(
      "SELECT * FROM semantic_nodes WHERE type = 'location' AND confidence >= 0.3 ORDER BY confidence DESC LIMIT 10"
    );
    ctx.items = this.db.all(
      "SELECT * FROM semantic_nodes WHERE type = 'item' AND confidence >= 0.3 ORDER BY confidence DESC LIMIT 10"
    );

    // Active patterns and habits
    ctx.patterns = this.db.all(
      'SELECT * FROM procedural_patterns ORDER BY activation_count DESC LIMIT 5'
    );
    ctx.habits = this.db.all(
      'SELECT * FROM habits WHERE strength >= 0.3 ORDER BY strength DESC LIMIT 5'
    );

    // Keyword-based relevant episodes (based on current message)
    if (currentMessage) {
      const keywords = this._extractSimpleKeywords(currentMessage);
      if (keywords.length > 0) {
        const placeholders = keywords.map(() => '?').join(',');
        const relevantIds = this.db.all(
          `SELECT DISTINCT episode_id FROM episode_keywords WHERE keyword IN (${placeholders})`,
          keywords
        );
        if (relevantIds.length > 0) {
          const epIds = relevantIds.map(r => r.episode_id);
          const epPlaceholders = epIds.map(() => '?').join(',');
          ctx.relevantEpisodes = this.db.all(
            `SELECT * FROM episodes WHERE id IN (${epPlaceholders}) ORDER BY timestamp DESC LIMIT 10`,
            epIds
          );
        }
      }
    }

    return ctx;
  }

  /**
   * Build the prompt that asks the LLM to generate the plot summary.
   */
  _buildPlotPrompt(ctx, currentMessage) {
    const sections = [];

    // Character knowledge
    if (ctx.characters && ctx.characters.length > 0) {
      sections.push('## BEKANNTE CHARAKTERE:');
      for (const char of ctx.characters) {
        const props = typeof char.properties === 'string' ? JSON.parse(char.properties) : (char.properties || {});
        const entries = Object.entries(props).filter(([, v]) => v);
        if (entries.length > 0) {
          sections.push(`**${char.label}**: ${entries.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
        } else {
          sections.push(`**${char.label}**`);
        }
      }
      sections.push('');
    }

    // Location knowledge
    if (ctx.locations && ctx.locations.length > 0) {
      sections.push('## BEKANNTE ORTE:');
      for (const loc of ctx.locations) {
        const props = typeof loc.properties === 'string' ? JSON.parse(loc.properties) : (loc.properties || {});
        const desc = props.beschreibung || props.typ || '';
        sections.push(`- ${loc.label}${desc ? ': ' + desc : ''}`);
      }
      sections.push('');
    }

    // Item knowledge
    if (ctx.items && ctx.items.length > 0) {
      sections.push('## BEKANNTE GEGENSTÄNDE:');
      for (const item of ctx.items) {
        const props = typeof item.properties === 'string' ? JSON.parse(item.properties) : (item.properties || {});
        const desc = props.beschreibung || '';
        const owner = props.besitzer || '';
        sections.push(`- ${item.label}${owner ? ' (Besitzer: ' + owner + ')' : ''}${desc ? ': ' + desc : ''}`);
      }
      sections.push('');
    }

    // Episode history (chronological, oldest first for narrative flow)
    const allEpisodes = [...(ctx.episodes || [])].reverse();
    if (allEpisodes.length > 0) {
      sections.push('## BISHERIGE EREIGNISSE (chronologisch):');
      for (const ep of allEpisodes) {
        const sender = JSON.parse(ep.participants || '["?"]')[0];
        // Truncate but keep more than injection (500 chars for plot context)
        const text = ep.content.length > 500 ? ep.content.slice(0, 500) + '...' : ep.content;
        sections.push(`[${sender}]: ${text}`);
      }
      sections.push('');
    }

    // Consolidated memories (compressed older events)
    if (ctx.consolidated && ctx.consolidated.length > 0) {
      sections.push('## ÄLTERE ZUSAMMENGEFASSTE EREIGNISSE:');
      for (const mem of ctx.consolidated) {
        sections.push(`- ${mem.summary}`);
      }
      sections.push('');
    }

    // Relevant episodes from keyword search
    if (ctx.relevantEpisodes && ctx.relevantEpisodes.length > 0) {
      const recentIds = new Set((ctx.episodes || []).map(e => e.id));
      const extra = ctx.relevantEpisodes.filter(e => !recentIds.has(e.id));
      if (extra.length > 0) {
        sections.push('## BESONDERS RELEVANTE ÄLTERE ERINNERUNGEN:');
        for (const ep of extra) {
          const sender = JSON.parse(ep.participants || '["?"]')[0];
          const text = ep.content.length > 300 ? ep.content.slice(0, 300) + '...' : ep.content;
          sections.push(`[${sender}]: ${text}`);
        }
        sections.push('');
      }
    }

    // Patterns
    if (ctx.patterns && ctx.patterns.length > 0) {
      sections.push('## VERHALTENSMUSTER:');
      for (const p of ctx.patterns) {
        sections.push(`- Bei ${p.trigger_desc}: ${p.response}`);
      }
      sections.push('');
    }

    const contextBlock = sections.join('\n');

    // Use custom prompt if set, otherwise use the default from index.js
    const customPrompt = this.settings?.plotCustomPrompt;
    if (customPrompt) {
      return customPrompt
        .replace(/\{\{lastMessage\}\}/g, currentMessage || '(unbekannt)')
        .replace(/\{\{brainData\}\}/g, contextBlock);
    }

    // Default prompt (also exported as DEFAULT_PLOT_PROMPT in index.js)
    return `Du bist ein Kontext-Analyst für ein Rollenspiel. Analysiere die folgenden Gehirn-Daten und erstelle eine strukturierte Kontext-Zusammenfassung, die einer KI hilft die aktuelle Situation zu verstehen und passend zu antworten.

Die letzte Nachricht des Spielers war: "${currentMessage || '(unbekannt)'}"

ERSTELLE FOLGENDE ABSCHNITTE:

## WORUM GEHT ES GERADE
Beschreibe in 2-3 Sätzen was gerade in der Szene passiert und worauf die letzte Spieler-Nachricht abzielt.

## INVOLVIERTE PERSONEN
Liste alle aktuell relevanten Charaktere auf mit:
- Name und Rolle in der aktuellen Szene
- Wichtige Eigenschaften (Aussehen, Persönlichkeit, Beziehungen)
- Aktuelle Stimmung/Haltung wenn erkennbar

## ZUSAMMENFASSUNG DER LETZTEN EREIGNISSE
Fasse die letzten Gespräche und Ereignisse chronologisch zusammen (kurz und prägnant, max 5-8 Sätze).

## WICHTIGE VERBINDUNGEN & HINTERGRUND
Relevante Fakten aus der Geschichte die für die aktuelle Situation wichtig sind:
- Beziehungen zwischen Charakteren
- Vergangene Ereignisse die jetzt relevant sind
- Orte, Gegenstände oder Umstände die eine Rolle spielen

## AKTUELLE SZENE
Beschreibe den aktuellen Ort, die Atmosphäre und die unmittelbare Situation in der sich die Charaktere befinden.

REGELN:
- Schreibe in der Sprache des Rollenspiels
- Sei präzise und informativ, nicht ausschmückend
- Fokussiere auf das was die KI wissen MUSS um passend zu antworten
- Wenn Informationen fehlen, lass den Abschnitt weg statt zu raten

GEHIRN-DATEN:
${contextBlock}

Schreibe NUR die Kontext-Analyse, keine Meta-Kommentare:`;
  }

  /**
   * Clean up the LLM's plot output.
   */
  _cleanPlot(text) {
    // Remove any meta-commentary the LLM might add
    let clean = text
      .replace(/^(Hier ist|Plot-Zusammenfassung|Zusammenfassung|Kontext-Analyse|Analyse)[:.]?\s*/i, '')
      .replace(/^#+\s+(Plot|Kontext).*\n/i, '')
      .trim();

    return clean;
  }

  /**
   * Format the analysis as a system context injection string.
   * Returns the formatted text for use with setExtensionPrompt.
   */
  _formatAsInjection(plotText) {
    return `[NeuroCore Kontext-Analyse — Nutze die folgenden Informationen als Hintergrundwissen für deine nächste Antwort. Antworte natürlich im Rollenspiel-Stil, nicht als Zusammenfassung.]\n\n${plotText}`;
  }

  /**
   * Simple keyword extraction for context-aware recall.
   */
  _extractSimpleKeywords(text) {
    return text
      .toLowerCase()
      .replace(/[^\wäöüß\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10);
  }
}

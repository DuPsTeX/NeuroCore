// core/processes/PlotGenerator.js — Generates plot summaries from brain memory
// Replaces chat history with a condensed narrative context

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
    this.lastPlot = '';
    this.lastPlotTimestamp = 0;
    this.plotCacheDuration = 0; // 0 = regenerate every time
  }

  /**
   * Generate a plot summary from brain memory, tailored to the current user message.
   * Returns an array of {role, content} messages to inject as fake history.
   */
  async generate(currentUserMessage) {
    if (!this.generatePlot || !this.db) return null;

    try {
      // 1. Gather all context from the brain
      const context = this._gatherBrainContext(currentUserMessage);

      // 2. Build the plot generation prompt
      const prompt = this._buildPlotPrompt(context, currentUserMessage);

      // 3. Call LLM to generate the plot
      console.log('[NeuroCore PlotGen] Generating plot summary...');
      const plotText = await this.generatePlot(prompt);

      if (!plotText) {
        console.warn('[NeuroCore PlotGen] LLM returned empty plot');
        return null;
      }

      // 4. Clean up the plot text
      this.lastPlot = this._cleanPlot(plotText);
      this.lastPlotTimestamp = Date.now();

      console.log('[NeuroCore PlotGen] Plot generated, length:', this.lastPlot.length, 'chars');

      // 5. Format as history messages
      return this._formatAsHistory(this.lastPlot);
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

    return `Du bist ein Plot-Zusammenfasser für ein Rollenspiel. Erstelle aus den folgenden Gehirn-Daten eine zusammenhängende Plot-Zusammenfassung.

REGELN:
1. Schreibe eine NARRATIVE Zusammenfassung der bisherigen Geschichte (nicht als Aufzählung!)
2. Beschreibe die aktuelle Situation, den Ort, und was zuletzt passiert ist
3. Erwähne alle wichtigen Charaktere mit ihren relevanten Details (Aussehen, Rolle, Beziehungen)
4. Halte die Zusammenfassung in der Sprache des Rollenspiels (gleicher Stil, gleiche Perspektive)
5. Die Zusammenfassung soll 500-1500 Wörter lang sein — lang genug für vollen Kontext
6. Fokussiere auf die AKTUELLE SITUATION und WAS ALS NÄCHSTES RELEVANT IST
7. Erwähne vergangene Ereignisse nur wenn sie für die aktuelle Situation relevant sind
8. Die letzte Nachricht des Spielers war: "${currentMessage || '(unbekannt)'}" — stelle sicher dass der Kontext dafür gegeben ist

GEHIRN-DATEN:
${contextBlock}

Schreibe NUR die Plot-Zusammenfassung, keine Erklärungen oder Meta-Kommentare:`;
  }

  /**
   * Clean up the LLM's plot output.
   */
  _cleanPlot(text) {
    // Remove any meta-commentary the LLM might add
    let clean = text
      .replace(/^(Hier ist|Plot-Zusammenfassung|Zusammenfassung)[:.]?\s*/i, '')
      .replace(/^#+\s+Plot.*\n/i, '')
      .trim();

    return clean;
  }

  /**
   * Format the plot as chat history messages.
   * Returns array of {role, content} for injection into ST's chat array.
   */
  _formatAsHistory(plotText) {
    // Single assistant message containing the plot as narrative context
    return [
      {
        role: 'system',
        content: `[NeuroCore Plot-Erinnerung — Dies ist eine Zusammenfassung der bisherigen Geschichte. Nutze diese als Kontext für deine nächste Antwort.]\n\n${plotText}`,
      },
    ];
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

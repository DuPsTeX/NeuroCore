// core/regions/PrefrontalCortex.js — Working memory + prompt assembly

export class PrefrontalCortex {
  constructor({ maxSlots = 8, tokenBudget = 2000 } = {}) {
    this.maxSlots = maxSlots;
    this.tokenBudget = tokenBudget;
  }

  computeRelevance({ keywordMatch, emotionalValence, recency, retrievalFrequency }) {
    return (keywordMatch * 0.4) + (emotionalValence * 0.3) +
           (recency * 0.2) + (retrievalFrequency * 0.1);
  }

  /**
   * Select top slots respecting maxSlots and tokenBudget.
   * Semantic facts get +0.1 relevance bonus (more stable than episodic).
   */
  selectSlots(candidates) {
    // Apply semantic bonus
    const scored = candidates.map(c => ({
      ...c,
      _sortScore: c.relevanceScore + (c.source === 'semantic' ? 0.1 : 0),
    }));

    scored.sort((a, b) => b._sortScore - a._sortScore);

    const selected = [];
    let usedTokens = 0;

    for (const slot of scored) {
      if (selected.length >= this.maxSlots) break;
      if (usedTokens + slot.tokenCost > this.tokenBudget) continue;
      usedTokens += slot.tokenCost;
      selected.push(slot);
    }

    return selected;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Build the prompt injection text block.
   */
  assemblePromptInjection({ episodes = [], semanticFacts = [], patterns = [], emotionalState = null }) {
    const lines = ['[NeuroCore Memory Injection — START]', ''];

    // Active memories
    if (episodes.length > 0) {
      lines.push('## Aktive Erinnerungen (Working Memory):');
      for (const ep of episodes) {
        const valenceLabel = ep.emotional_valence > 0.6 ? ' (intensiv)' : '';
        lines.push(`- ${ep.content}${valenceLabel}`);
      }
      lines.push('');
    }

    // Semantic facts — grouped by type for better readability
    if (semanticFacts.length > 0) {
      const byType = {};
      for (const fact of semanticFacts) {
        const t = fact.type || 'other';
        if (!byType[t]) byType[t] = [];
        byType[t].push(fact);
      }

      const typeLabels = {
        character: 'Bekannte Charaktere',
        location: 'Bekannte Orte',
        item: 'Bekannte Gegenstände',
        event: 'Bekannte Ereignisse',
        concept: 'Bekannte Konzepte',
      };

      for (const [type, facts] of Object.entries(byType)) {
        lines.push(`## ${typeLabels[type] || 'Relevantes Wissen'}:`);
        for (const fact of facts) {
          const props = typeof fact.properties === 'string' ? JSON.parse(fact.properties) : fact.properties;
          const entries = Object.entries(props).filter(([, v]) => v);
          if (entries.length === 0) {
            lines.push(`- ${fact.label}`);
          } else if (type === 'character' && entries.length > 2) {
            // Detailed character block
            lines.push(`- **${fact.label}**:`);
            for (const [k, v] of entries) {
              lines.push(`  ${k}: ${v}`);
            }
          } else {
            const propsStr = entries.map(([k, v]) => `${k}: ${v}`).join(', ');
            lines.push(`- ${fact.label}: ${propsStr}`);
          }
        }
        lines.push('');
      }
    }

    // Procedural patterns
    if (patterns.length > 0) {
      lines.push('## Aktive Verhaltensmuster:');
      for (const p of patterns) {
        lines.push(`- Bei ${p.trigger_desc}: ${p.response}`);
      }
      lines.push('');
    }

    // Emotional state
    if (emotionalState && emotionalState.emotions && emotionalState.emotions.length > 0) {
      lines.push('## Emotionaler Zustand:');
      const emotionStr = emotionalState.emotions.map(e => `${e.type} (${(e.intensity * 100).toFixed(0)}%)`).join(', ');
      lines.push(`- Grundstimmung: ${emotionStr}`);
      lines.push('');
    }

    lines.push('[NeuroCore Memory Injection — ENDE]');

    return lines.join('\n');
  }
}

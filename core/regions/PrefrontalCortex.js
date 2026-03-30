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

    // Active memories — truncated to key content, not full messages
    if (episodes.length > 0) {
      lines.push('## Aktive Erinnerungen (Working Memory):');
      for (const ep of episodes) {
        const valenceLabel = ep.emotional_valence > 0.6 ? ' (intensiv)' : '';
        const summary = this._truncateEpisode(ep.content);
        if (summary) {
          lines.push(`- ${summary}${valenceLabel}`);
        }
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

  /**
   * Truncate an episode to its narrative core.
   * Strips stat blocks, markdown formatting, choice options, and OOC notes.
   * Keeps only dialogue and action descriptions, max 200 chars.
   */
  _truncateEpisode(content) {
    if (!content) return '';

    let text = content;

    // Remove stat blocks (lines starting with ** followed by stat-like patterns)
    text = text.replace(/\*\*(?:Level|XP|Geld|MP|HP|STR|DEX|CON|INT|WIS|CHA|Status|Erregung|Hunger|Sauberkeit|Ausdauer|Ausrüstung|Inventar|Fähigkeiten|Basiswerte|Standort)[:\s|].+/gi, '');

    // Remove section headers like "### Tay's Status", "### Gruppenstatus", "---"
    text = text.replace(/^#{1,4}\s+.+$/gm, '');
    text = text.replace(/^---+$/gm, '');

    // Remove choice blocks (lines starting with * A), * B), etc. or **A)**, **B)**)
    text = text.replace(/^\s*\*?\s*\*?\*?\s*[A-E]\)[\s\S]*?$/gm, '');

    // Remove OOC blocks
    text = text.replace(/\(OOC:[\s\S]*?\)/gi, '');

    // Remove markdown bold/italic markers but keep text
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');

    // Remove bullet point group status lines
    text = text.replace(/^\s*\*\s+\*\*(?:Luna|Lana|Sari|Kaito|Tay)[:\*][\s\S]*?$/gm, '');

    // Collapse whitespace
    text = text.replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ').trim();

    // If still too long, take first meaningful chunk
    if (text.length > 300) {
      // Try to find the first dialogue or action paragraph
      const dialogueMatch = text.match(/"[^"]{10,}"/);
      if (dialogueMatch) {
        // Get some context around the dialogue
        const idx = text.indexOf(dialogueMatch[0]);
        const start = Math.max(0, idx - 50);
        const end = Math.min(text.length, idx + dialogueMatch[0].length + 50);
        text = text.slice(start, end).trim();
      } else {
        text = text.slice(0, 300);
      }
    }

    // Final trim to 200 chars with word boundary
    if (text.length > 200) {
      const cut = text.lastIndexOf(' ', 200);
      text = text.slice(0, cut > 100 ? cut : 200) + '...';
    }

    return text;
  }
}

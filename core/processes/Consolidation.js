// core/processes/Consolidation.js — Sleep-cycle memory compression
import { extractKeywords } from '../KeywordExtractor.js';
import { randomUUID } from '../utils.js';

export class Consolidation {
  constructor({ db, hippocampus, temporal, cerebellum = null, basalGanglia = null, generateSummary = null }) {
    this.db = db;
    this.hippo = hippocampus;
    this.temporal = temporal;
    this.cerebellum = cerebellum;
    this.basalGanglia = basalGanglia;
    this.generateSummary = generateSummary; // Optional LLM function
  }

  async runFullCycle(messageCount) {
    await this.phase1LightSleep(messageCount);
    await this.phase2DeepSleep(messageCount);
    await this.phase3REM(messageCount);
    this._log(messageCount, 'full_cycle');
  }

  async phase1LightSleep(msgCount) {
    // Keywords and emotional tags should already be assigned at store time.
    // Defensive pass: no-op for now.
    this._log(msgCount, 'light_sleep');
  }

  async phase2DeepSleep(msgCount) {
    // Cluster unconsolidated episodes and compress
    const episodes = this.hippo.getUnconsolidated(50);
    if (episodes.length < 3) return; // Not enough to consolidate

    // Simple clustering: group by keyword overlap
    const clusters = this._clusterByKeywords(episodes);

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;

      // Generate summary
      let summary;
      if (this.generateSummary) {
        try {
          const texts = cluster.map(e => e.content).join('\n');
          const prompt = `Fasse die folgenden Ereignisse in 1-2 Sätzen zusammen. Behalte die Sprache bei:\n\n${texts}`;
          summary = await this.generateSummary(prompt);
        } catch {
          // LLM fallback: concatenate first sentences
          summary = this._fallbackSummary(cluster);
        }
      } else {
        summary = this._fallbackSummary(cluster);
      }

      // Compute importance as weighted average of valences
      const importance = cluster.reduce((s, e) => s + e.emotional_valence, 0) / cluster.length;

      // Extract themes
      const allKeywords = new Map();
      for (const ep of cluster) {
        const kws = extractKeywords(ep.content);
        for (const kw of kws) {
          allKeywords.set(kw.word, (allKeywords.get(kw.word) || 0) + 1);
        }
      }
      const themes = [...allKeywords.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

      // Store consolidated memory
      const id = randomUUID();
      this.db.run(
        `INSERT INTO consolidated_memories (id, source_episodes, summary, importance, themes)
         VALUES (?, ?, ?, ?, ?)`,
        [id, JSON.stringify(cluster.map(e => e.id)), summary, importance, JSON.stringify(themes)]
      );

      // Mark source episodes as consolidated
      this.hippo.markConsolidated(cluster.map(e => e.id));

      // Note: Entity extraction (characters, locations, items) is now handled
      // by _extractEntityDetails() in the REM phase via LLM, which assigns
      // correct types and detailed properties.
    }

    this._log(msgCount, 'deep_sleep');
  }

  async phase3REM(msgCount) {
    const recent = this.db.all(
      'SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp DESC LIMIT 20'
    );

    // 1. Create semantic edges between co-occurring proper nouns
    this._createCoOccurrenceEdges(recent);

    // 2. Extract detailed entity info (characters, locations, items)
    await this._extractEntityDetails(recent);

    // 3. Strengthen existing + discover new procedural patterns
    await this._extractPatterns(recent);

    // 4. Decay unrewarded habits + discover new ones
    await this._updateHabitStrengths(recent);

    this._log(msgCount, 'rem_sleep');
  }

  /**
   * Extract detailed properties for characters, locations, and items via LLM.
   * Updates existing semantic nodes with rich properties (appearance, personality, etc.)
   * and creates new nodes for locations and items.
   */
  async _extractEntityDetails(episodes) {
    if (!this.generateSummary || episodes.length < 2) return;

    try {
      // Use more text per episode for richer detail extraction
      // Budget: ~12k chars total (~3500 tokens) to stay well within 4000 max_tokens
      const maxExcerptChars = 12000;
      let totalChars = 0;
      const parts = [];
      for (const ep of episodes.slice(0, 30)) {
        const sender = JSON.parse(ep.participants || '["?"]')[0];
        const text = ep.content.length > 1500 ? ep.content.slice(0, 1500) + '...' : ep.content;
        const part = `[${sender}]: ${text}`;
        if (totalChars + part.length > maxExcerptChars) break;
        totalChars += part.length;
        parts.push(part);
      }
      const excerpt = parts.join('\n\n');

      const prompt = `Analysiere diesen RP-Chatverlauf und extrahiere ALLE Entitäten mit Details.

Extrahiere 3 Kategorien:

## 1. CHARACTERS (Personen/Charaktere)
Für jeden Charakter extrahiere SO DETAILLIERT WIE MÖGLICH:
- name: Vollständiger Name
- geschlecht: männlich/weiblich/andere
- aussehen_gesicht: Augenfarbe, Haarfarbe, Haarlänge, Frisur, Gesichtszüge, Augenform etc.
- aussehen_koerper: Körpergröße, Statur, Körperbau, Brustgröße (bei Frauen), Hüften, Beine, Haut, Narben, Tattoos, Muttermale etc.
- kleidung: Aktuelle Kleidung, Rüstung, Accessoires
- ausruestung: Waffen, Werkzeuge, magische Gegenstände
- persoenlichkeit: Charakterzüge, Temperament, Eigenarten
- rolle: Beruf, Klasse, Funktion in der Geschichte
- faehigkeiten: Magie, Kampfstil, besondere Fähigkeiten
- beziehungen: Beziehungen zu anderen Charakteren (z.B. "Freundin von X", "Rivale von Y")
- sonstiges: Alles andere Wichtige (Alter, Rasse/Spezies, Herkunft etc.)

## 2. LOCATIONS (Orte)
- name: Name des Ortes
- beschreibung: Detaillierte Beschreibung (Atmosphäre, Aussehen, Besonderheiten)
- typ: Art des Ortes (Taverne, Wald, Stadt, Dungeon etc.)

## 3. ITEMS (Wichtige Gegenstände)
- name: Name des Gegenstands
- beschreibung: Aussehen und Eigenschaften
- besitzer: Wem gehört es?
- typ: Art (Waffe, Artefakt, Trank etc.)

WICHTIG:
- Nur Informationen extrahieren die EXPLIZIT im Text stehen oder klar impliziert werden
- Leere Felder weglassen (nicht raten!)
- Behalte die Originalsprache bei

Antworte NUR mit JSON:
{"characters": [...], "locations": [...], "items": [...]}

Chatverlauf:
${excerpt}`;

      const result = await this.generateSummary(prompt);
      if (!result) return;

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      let entities;
      try {
        entities = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn('[NeuroCore] Failed to parse entity extraction response');
        return;
      }

      // Process characters
      if (Array.isArray(entities.characters)) {
        for (const char of entities.characters) {
          if (!char.name) continue;
          const label = char.name.trim();

          // Create or find the character node
          const nodeId = this.temporal.addNode({
            type: 'character',
            label,
            properties: {},
          });

          // Build properties object from all non-empty fields
          const props = {};
          const fieldMap = {
            geschlecht: 'geschlecht',
            aussehen_gesicht: 'aussehen_gesicht',
            aussehen_koerper: 'aussehen_koerper',
            kleidung: 'kleidung',
            ausruestung: 'ausruestung',
            persoenlichkeit: 'persoenlichkeit',
            rolle: 'rolle',
            faehigkeiten: 'faehigkeiten',
            beziehungen: 'beziehungen',
            sonstiges: 'sonstiges',
          };

          for (const [srcKey, destKey] of Object.entries(fieldMap)) {
            if (char[srcKey] && String(char[srcKey]).trim()) {
              props[destKey] = String(char[srcKey]).trim();
            }
          }

          if (Object.keys(props).length > 0) {
            this.temporal.updateNodeProperties(nodeId, props);
            console.log('[NeuroCore] Updated character:', label, '— fields:', Object.keys(props).join(', '));
          }
        }
      }

      // Process locations
      if (Array.isArray(entities.locations)) {
        for (const loc of entities.locations) {
          if (!loc.name) continue;
          const label = loc.name.trim();

          const nodeId = this.temporal.addNode({
            type: 'location',
            label,
            properties: {},
          });

          const props = {};
          if (loc.beschreibung) props.beschreibung = loc.beschreibung;
          if (loc.typ) props.typ = loc.typ;

          if (Object.keys(props).length > 0) {
            this.temporal.updateNodeProperties(nodeId, props);
            console.log('[NeuroCore] Updated location:', label);
          }
        }
      }

      // Process items
      if (Array.isArray(entities.items)) {
        for (const item of entities.items) {
          if (!item.name) continue;
          const label = item.name.trim();

          const nodeId = this.temporal.addNode({
            type: 'item',
            label,
            properties: {},
          });

          const props = {};
          if (item.beschreibung) props.beschreibung = item.beschreibung;
          if (item.besitzer) props.besitzer = item.besitzer;
          if (item.typ) props.typ = item.typ;

          if (Object.keys(props).length > 0) {
            this.temporal.updateNodeProperties(nodeId, props);
            console.log('[NeuroCore] Updated item:', label);
          }
        }
      }

      // Create relationship edges between characters
      if (Array.isArray(entities.characters)) {
        for (const char of entities.characters) {
          if (!char.name || !char.beziehungen) continue;
          const sourceNode = this.temporal.getNodeByLabel(char.name.trim());
          if (!sourceNode) continue;

          // Try to find mentioned character names in the relationship text
          for (const otherChar of entities.characters) {
            if (!otherChar.name || otherChar.name === char.name) continue;
            if (char.beziehungen.includes(otherChar.name)) {
              const targetNode = this.temporal.getNodeByLabel(otherChar.name.trim());
              if (targetNode) {
                this.temporal.addEdge(sourceNode.id, targetNode.id, 'relationship', 0.6);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[NeuroCore] Entity extraction failed:', err.message);
    }
  }

  async _extractPatterns(episodes) {
    if (!this.cerebellum || episodes.length < 2) return;

    // 1. Find recurring keywords
    const keywordCounts = new Map();
    for (const ep of episodes) {
      const kws = extractKeywords(ep.content);
      for (const kw of kws) {
        keywordCounts.set(kw.word, (keywordCounts.get(kw.word) || 0) + 1);
      }
    }
    const recurring = [...keywordCounts.entries()].filter(([, c]) => c >= 3).map(([w]) => w);

    // 2. Strengthen existing patterns that match
    if (recurring.length > 0) {
      const existing = this.cerebellum.matchPatterns(recurring);
      for (const p of existing) {
        this.cerebellum.activatePattern(p.id);
      }
    }

    // 3. Try to discover NEW patterns via LLM
    if (this.generateSummary && episodes.length >= 3) {
      await this._discoverPatternsViaLLM(episodes);
    }
  }

  async _discoverPatternsViaLLM(episodes) {
    try {
      // Build conversation excerpt for the LLM
      const excerpt = episodes.slice(0, 20).map(ep => {
        const sender = JSON.parse(ep.participants || '["?"]')[0];
        const text = ep.content.length > 300 ? ep.content.slice(0, 300) + '...' : ep.content;
        return `[${sender}]: ${text}`;
      }).join('\n\n');

      const prompt = `Analysiere diesen RP-Chatverlauf und finde wiederkehrende Verhaltensmuster.

Ein Muster besteht aus:
- trigger: Was löst das Verhalten aus? (kurze Beschreibung)
- trigger_keywords: Schlüsselwörter die den Trigger erkennen (Array)
- response: Wie reagiert der Charakter typischerweise? (kurze Beschreibung)

Suche nach Mustern wie:
- Wiederkehrende Reaktionen auf bestimmte Situationen
- Typische Verhaltensweisen eines Charakters
- Gesprächsmuster die sich wiederholen

Antworte NUR mit einem JSON-Array. Maximal 3 Muster. Wenn keine erkennbar sind, antworte mit [].

Format:
[{"trigger": "...", "trigger_keywords": ["..."], "response": "..."}]

Chatverlauf:
${excerpt}`;

      const result = await this.generateSummary(prompt);
      if (!result) return;

      // Parse JSON from LLM response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      let patterns;
      try {
        patterns = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn('[NeuroCore] Failed to parse LLM pattern response');
        return;
      }

      if (!Array.isArray(patterns)) return;

      for (const p of patterns) {
        if (!p.trigger || !p.response || !Array.isArray(p.trigger_keywords)) continue;
        if (p.trigger_keywords.length === 0) continue;

        // Check if a similar pattern already exists (keyword overlap > 50%)
        const existing = this.cerebellum.matchPatterns(p.trigger_keywords);
        const isDuplicate = existing.some(e => e.overlapScore > 0.5);

        if (!isDuplicate) {
          const id = this.cerebellum.storePattern({
            trigger: p.trigger,
            triggerKeywords: p.trigger_keywords,
            response: p.response,
            examples: episodes.slice(0, 3).map(e => e.content.slice(0, 100)),
          });
          console.log('[NeuroCore] New pattern discovered:', p.trigger, '->', p.response);
        }
      }
    } catch (err) {
      console.warn('[NeuroCore] Pattern discovery failed:', err.message);
    }
  }

  async _updateHabitStrengths(episodes) {
    if (!this.basalGanglia) return;
    this.basalGanglia.decayUnrewardedHabits();

    // Discover new habits via LLM
    if (this.generateSummary && episodes && episodes.length >= 3) {
      await this._discoverHabitsViaLLM(episodes);
    }
  }

  async _discoverHabitsViaLLM(episodes) {
    try {
      // Separate user and character messages
      const userMsgs = [];
      const charMsgs = [];
      for (const ep of episodes.slice(0, 20)) {
        const sender = JSON.parse(ep.participants || '["?"]')[0];
        const text = ep.content.length > 300 ? ep.content.slice(0, 300) + '...' : ep.content;
        if (sender === 'user') {
          userMsgs.push(text);
        } else {
          charMsgs.push(text);
        }
      }

      const excerpt = episodes.slice(0, 20).map(ep => {
        const sender = JSON.parse(ep.participants || '["?"]')[0];
        const text = ep.content.length > 300 ? ep.content.slice(0, 300) + '...' : ep.content;
        return `[${sender}]: ${text}`;
      }).join('\n\n');

      const prompt = `Analysiere diesen RP-Chatverlauf und finde Gewohnheiten der Charaktere.

Eine Gewohnheit ist ein wiederkehrendes Verhalten in einem bestimmten Kontext:
- context: In welcher Situation tritt das Verhalten auf? (z.B. "In der Taverne", "Bei Gefahr", "Beim Handeln")
- behavior: Was tut der Charakter automatisch? (z.B. "bestellt immer Bier", "greift zur Waffe", "versucht zu feilschen")

Suche nach:
- Automatische Reaktionen die ohne Nachdenken passieren
- Wiederkehrende Vorlieben oder Abneigungen
- Typische Verhaltensweisen in bestimmten Orten oder Situationen
- Soziale Gewohnheiten (wie der Charakter mit NPCs umgeht)

Antworte NUR mit einem JSON-Array. Maximal 3 Gewohnheiten. Wenn keine erkennbar sind, antworte mit [].

Format:
[{"context": "...", "behavior": "..."}]

Chatverlauf:
${excerpt}`;

      const result = await this.generateSummary(prompt);
      if (!result) return;

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;

      let habits;
      try {
        habits = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn('[NeuroCore] Failed to parse LLM habit response');
        return;
      }

      if (!Array.isArray(habits)) return;

      // Check existing habits to avoid duplicates
      const existingHabits = this.basalGanglia.getAllHabits();

      for (const h of habits) {
        if (!h.context || !h.behavior) continue;

        // Simple duplicate check: same context+behavior substring
        const isDuplicate = existingHabits.some(ex =>
          ex.context.toLowerCase().includes(h.context.toLowerCase().slice(0, 20)) ||
          ex.behavior.toLowerCase().includes(h.behavior.toLowerCase().slice(0, 20))
        );

        if (!isDuplicate) {
          const id = this.basalGanglia.createHabit({
            context: h.context,
            behavior: h.behavior,
          });
          // Give initial reward based on how many episodes mention the context
          if (id) {
            this.basalGanglia.recordReward(id, 0.5);
            console.log('[NeuroCore] New habit discovered:', h.context, '->', h.behavior);
          }
        }
      }
    } catch (err) {
      console.warn('[NeuroCore] Habit discovery failed:', err.message);
    }
  }

  _clusterByKeywords(episodes) {
    // Simple single-linkage clustering based on Jaccard keyword overlap
    const assigned = new Set();
    const clusters = [];

    for (let i = 0; i < episodes.length; i++) {
      if (assigned.has(i)) continue;
      const cluster = [episodes[i]];
      assigned.add(i);

      const kwsI = new Set(JSON.parse(episodes[i].keywords));

      for (let j = i + 1; j < episodes.length; j++) {
        if (assigned.has(j)) continue;
        const kwsJ = new Set(JSON.parse(episodes[j].keywords));

        // Jaccard overlap
        const intersection = [...kwsI].filter(k => kwsJ.has(k)).length;
        const union = new Set([...kwsI, ...kwsJ]).size;
        const overlap = union > 0 ? intersection / union : 0;

        if (overlap > 0.2) {
          cluster.push(episodes[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  _fallbackSummary(cluster) {
    // Take first 100 chars of each episode, join
    return cluster.map(e => {
      const short = e.content.length > 100 ? e.content.slice(0, 100) + '...' : e.content;
      return short;
    }).join(' | ');
  }

  _createCoOccurrenceEdges(episodes) {
    for (const ep of episodes) {
      const kws = extractKeywords(ep.content).filter(k => k.isProperNoun);
      for (let i = 0; i < kws.length; i++) {
        for (let j = i + 1; j < kws.length; j++) {
          const label1 = kws[i].word.charAt(0).toUpperCase() + kws[i].word.slice(1);
          const label2 = kws[j].word.charAt(0).toUpperCase() + kws[j].word.slice(1);
          const nodeA = this.temporal.getNodeByLabel(label1);
          const nodeB = this.temporal.getNodeByLabel(label2);
          if (nodeA && nodeB) {
            this.temporal.addEdge(nodeA.id, nodeB.id, 'co_occurs_with', 0.3);
          }
        }
      }
    }
  }

  _log(msgCount, type) {
    this.db.run(
      'INSERT INTO consolidation_log (timestamp, phase, details, episodes_processed) VALUES (?, ?, ?, ?)',
      [Date.now(), type, JSON.stringify({ messageCount: msgCount }), 0]
    );
  }
}

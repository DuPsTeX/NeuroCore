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
          summary = await this.generateSummary(texts);
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

      // Add proper nouns from cluster to semantic graph
      for (const ep of cluster) {
        const kws = extractKeywords(ep.content);
        for (const kw of kws) {
          if (kw.isProperNoun) {
            this.temporal.addNode({
              type: 'character',
              label: kw.word.charAt(0).toUpperCase() + kw.word.slice(1),
              properties: {},
            });
          }
        }
      }
    }

    this._log(msgCount, 'deep_sleep');
  }

  async phase3REM(msgCount) {
    const recent = this.db.all(
      'SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp DESC LIMIT 20'
    );

    // 1. Create semantic edges between co-occurring proper nouns
    this._createCoOccurrenceEdges(recent);

    // 2. Strengthen existing procedural patterns that match recurring keywords
    this._extractPatterns(recent);

    // 3. Decay unrewarded habits
    this._updateHabitStrengths(msgCount);

    this._log(msgCount, 'rem_sleep');
  }

  _extractPatterns(episodes) {
    if (!this.cerebellum || episodes.length < 2) return;
    const keywordCounts = new Map();
    for (const ep of episodes) {
      const kws = extractKeywords(ep.content);
      for (const kw of kws) {
        keywordCounts.set(kw.word, (keywordCounts.get(kw.word) || 0) + 1);
      }
    }
    const recurring = [...keywordCounts.entries()].filter(([, c]) => c >= 3).map(([w]) => w);
    if (recurring.length > 0) {
      const existing = this.cerebellum.matchPatterns(recurring);
      for (const p of existing) {
        this.cerebellum.activatePattern(p.id);
      }
    }
  }

  _updateHabitStrengths() {
    if (!this.basalGanglia) return;
    this.basalGanglia.decayUnrewardedHabits();
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

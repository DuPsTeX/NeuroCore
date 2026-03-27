// core/storage/JsonExporter.js — Brain import/export

export class JsonExporter {
  constructor(db) {
    this.db = db;
  }

  exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: this._exportMeta(),
      episodes: this.db.all('SELECT * FROM episodes'),
      episodeKeywords: this.db.all('SELECT * FROM episode_keywords'),
      consolidatedMemories: this.db.all('SELECT * FROM consolidated_memories'),
      semanticNodes: this.db.all('SELECT * FROM semantic_nodes'),
      semanticEdges: this.db.all('SELECT * FROM semantic_edges'),
      emotionalTags: this.db.all('SELECT * FROM emotional_tags'),
      proceduralPatterns: this.db.all('SELECT * FROM procedural_patterns'),
      habits: this.db.all('SELECT * FROM habits'),
      consolidationLog: this.db.all('SELECT * FROM consolidation_log'),
    };
  }

  _exportMeta() {
    const rows = this.db.all('SELECT * FROM brain_meta');
    const meta = {};
    for (const r of rows) meta[r.key] = r.value;
    return meta;
  }

  importAll(data) {
    if (!data || data.version !== 1) {
      throw new Error('Invalid export format or unsupported version');
    }

    // Clear existing data
    const tables = [
      'episode_keywords', 'emotional_tags', 'episodes',
      'consolidated_memories', 'semantic_edges', 'semantic_nodes',
      'procedural_patterns', 'habits', 'consolidation_log', 'brain_meta',
    ];
    for (const table of tables) {
      this.db.run(`DELETE FROM ${table}`);
    }

    // Import meta
    if (data.meta) {
      for (const [key, value] of Object.entries(data.meta)) {
        this.db.run('INSERT INTO brain_meta (key, value) VALUES (?, ?)', [key, value]);
      }
    }

    // Import episodes
    for (const ep of (data.episodes || [])) {
      this.db.run(
        `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time, retrieval_count, last_retrieved, consolidated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ep.id, ep.timestamp, ep.content, ep.keywords, ep.participants,
         ep.emotional_valence, ep.decay_base_time, ep.retrieval_count || 0,
         ep.last_retrieved || 0, ep.consolidated || 0]
      );
    }

    // Import episode keywords
    for (const ek of (data.episodeKeywords || [])) {
      this.db.run(
        'INSERT OR IGNORE INTO episode_keywords (episode_id, keyword, is_proper_noun) VALUES (?, ?, ?)',
        [ek.episode_id, ek.keyword, ek.is_proper_noun || 0]
      );
    }

    // Import consolidated memories
    for (const cm of (data.consolidatedMemories || [])) {
      this.db.run(
        'INSERT INTO consolidated_memories (id, source_episodes, summary, importance, themes) VALUES (?, ?, ?, ?, ?)',
        [cm.id, cm.source_episodes, cm.summary, cm.importance, cm.themes]
      );
    }

    // Import semantic nodes
    for (const sn of (data.semanticNodes || [])) {
      this.db.run(
        'INSERT INTO semantic_nodes (id, type, label, properties, confidence) VALUES (?, ?, ?, ?, ?)',
        [sn.id, sn.type, sn.label, sn.properties, sn.confidence || 0.5]
      );
    }

    // Import semantic edges
    for (const se of (data.semanticEdges || [])) {
      this.db.run(
        'INSERT OR IGNORE INTO semantic_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)',
        [se.source_id, se.target_id, se.relation, se.weight || 0.5]
      );
    }

    // Import emotional tags
    for (const et of (data.emotionalTags || [])) {
      this.db.run(
        'INSERT INTO emotional_tags (id, episode_id, type, intensity, evidence) VALUES (?, ?, ?, ?, ?)',
        [et.id, et.episode_id, et.type, et.intensity, et.evidence]
      );
    }

    // Import procedural patterns
    for (const pp of (data.proceduralPatterns || [])) {
      this.db.run(
        `INSERT INTO procedural_patterns (id, trigger_desc, trigger_keywords, response, strength, activation_count, last_activated, examples)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [pp.id, pp.trigger_desc, pp.trigger_keywords, pp.response,
         pp.strength || 0.1, pp.activation_count || 0, pp.last_activated || 0, pp.examples || '[]']
      );
    }

    // Import habits
    for (const h of (data.habits || [])) {
      this.db.run(
        'INSERT INTO habits (id, context, behavior, reward_history, average_reward, strength) VALUES (?, ?, ?, ?, ?, ?)',
        [h.id, h.context, h.behavior, h.reward_history || '[]', h.average_reward || 0, h.strength || 0]
      );
    }

    // Import consolidation log
    for (const cl of (data.consolidationLog || [])) {
      this.db.run(
        'INSERT INTO consolidation_log (timestamp, phase, details, episodes_processed) VALUES (?, ?, ?, ?)',
        [cl.timestamp, cl.phase, cl.details, cl.episodes_processed || 0]
      );
    }
  }
}

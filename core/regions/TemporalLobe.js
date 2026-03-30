// core/regions/TemporalLobe.js — Semantic knowledge graph
import { randomUUID } from '../utils.js';

export class TemporalLobe {
  constructor(db) {
    this.db = db;
  }

  addNode({ type, label, properties = {}, confidence = 0.5 }) {
    // Check if node with same label+type exists
    const existing = this.db.get(
      'SELECT * FROM semantic_nodes WHERE label = ? COLLATE NOCASE AND type = ?',
      [label, type]
    );
    if (existing) {
      // Increase confidence (max 1.0)
      const newConf = Math.min(existing.confidence + 0.1, 1.0);
      this.db.run('UPDATE semantic_nodes SET confidence = ? WHERE id = ?', [newConf, existing.id]);
      return existing.id;
    }
    const id = randomUUID();
    this.db.run(
      'INSERT INTO semantic_nodes (id, type, label, properties, confidence) VALUES (?, ?, ?, ?, ?)',
      [id, type, label, JSON.stringify(properties), confidence]
    );
    return id;
  }

  addEdge(sourceId, targetId, relation, weight = 0.5) {
    this.db.run(
      'INSERT OR REPLACE INTO semantic_edges (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)',
      [sourceId, targetId, relation, weight]
    );
  }

  /**
   * Merge new properties into an existing node. Existing keys are preserved
   * unless the new value is longer/more detailed (longer string wins).
   */
  updateNodeProperties(nodeId, newProps) {
    const node = this.db.get('SELECT * FROM semantic_nodes WHERE id = ?', [nodeId]);
    if (!node) return;

    const existing = typeof node.properties === 'string' ? JSON.parse(node.properties) : (node.properties || {});

    for (const [key, value] of Object.entries(newProps)) {
      if (!value) continue;
      const oldVal = existing[key];
      // Keep the longer/more detailed value
      if (!oldVal || String(value).length > String(oldVal).length) {
        existing[key] = value;
      }
    }

    this.db.run('UPDATE semantic_nodes SET properties = ? WHERE id = ?',
      [JSON.stringify(existing), nodeId]);
  }

  getNodeByLabel(label) {
    return this.db.get(
      'SELECT * FROM semantic_nodes WHERE label = ? COLLATE NOCASE',
      [label]
    );
  }

  getNodeById(id) {
    return this.db.get('SELECT * FROM semantic_nodes WHERE id = ?', [id]);
  }

  getEdgesFrom(nodeId) {
    return this.db.all(
      'SELECT * FROM semantic_edges WHERE source_id = ?',
      [nodeId]
    );
  }

  getEdgesTo(nodeId) {
    return this.db.all(
      'SELECT * FROM semantic_edges WHERE target_id = ?',
      [nodeId]
    );
  }

  findNodes(keywords) {
    const results = [];
    for (const kw of keywords) {
      const matches = this.db.all(
        'SELECT * FROM semantic_nodes WHERE label LIKE ?',
        [`%${kw}%`]
      );
      for (const m of matches) {
        if (!results.find(r => r.id === m.id)) {
          results.push(m);
        }
      }
    }
    return results;
  }

  getAllNodesAndEdges() {
    const nodes = this.db.all('SELECT * FROM semantic_nodes');
    const edges = this.db.all('SELECT * FROM semantic_edges');
    return { nodes, edges };
  }
}

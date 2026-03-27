// core/regions/Cerebellum.js — Procedural pattern recognition
import { randomUUID } from '../utils.js';

export class Cerebellum {
  constructor(db) {
    this.db = db;
  }

  storePattern({ trigger, triggerKeywords, response, examples = [] }) {
    const id = randomUUID();
    this.db.run(
      `INSERT INTO procedural_patterns (id, trigger_desc, trigger_keywords, response, strength, activation_count, last_activated, examples)
       VALUES (?, ?, ?, ?, 0.1, 0, 0, ?)`,
      [id, trigger, JSON.stringify(triggerKeywords), response, JSON.stringify(examples)]
    );
    return id;
  }

  matchPatterns(keywords) {
    const all = this.db.all('SELECT * FROM procedural_patterns');
    const matches = [];

    for (const pattern of all) {
      const triggerKws = JSON.parse(pattern.trigger_keywords);
      // Count keyword overlap
      const overlap = keywords.filter(k => triggerKws.includes(k)).length;
      if (overlap > 0) {
        matches.push({ ...pattern, overlapScore: overlap / triggerKws.length });
      }
    }

    // Sort by overlap * strength
    matches.sort((a, b) => (b.overlapScore * b.strength) - (a.overlapScore * a.strength));
    return matches;
  }

  activatePattern(id) {
    this.db.run(
      `UPDATE procedural_patterns
       SET activation_count = activation_count + 1,
           strength = MIN(strength + 0.05, 1.0),
           last_activated = ?
       WHERE id = ?`,
      [Date.now(), id]
    );
  }

  getPatternById(id) {
    return this.db.get('SELECT * FROM procedural_patterns WHERE id = ?', [id]);
  }

  getActivePatterns(minStrength = 0.2) {
    return this.db.all(
      'SELECT * FROM procedural_patterns WHERE strength >= ? ORDER BY strength DESC',
      [minStrength]
    );
  }

  weakenUnused(currentMsgCount, decayRate = 0.02) {
    const patterns = this.db.all('SELECT * FROM procedural_patterns');
    for (const p of patterns) {
      const sinceLast = currentMsgCount - (p.last_activated || 0);
      if (sinceLast > 50) {
        const newStrength = Math.max(p.strength - decayRate, 0);
        this.db.run('UPDATE procedural_patterns SET strength = ? WHERE id = ?', [newStrength, p.id]);
      }
    }
  }
}

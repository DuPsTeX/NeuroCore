// core/regions/Hippocampus.js — Episodic memory store + retrieval
import { extractKeywords, keywordMatch, computeRecency } from '../KeywordExtractor.js';
import { randomUUID } from '../utils.js';

export class Hippocampus {
  constructor(db) {
    this.db = db;
  }

  storeEpisode({ content, participants, emotionalValence, messageCount }) {
    const id = randomUUID();
    const keywords = extractKeywords(content);
    const keywordsJson = JSON.stringify(keywords.map(k => k.word));

    this.db.run(
      `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time, retrieval_count, last_retrieved, consolidated)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [id, Date.now(), content, keywordsJson, JSON.stringify(participants), emotionalValence, messageCount]
    );

    // Insert into episode_keywords junction table for indexed lookup
    for (const kw of keywords) {
      this.db.run(
        'INSERT OR IGNORE INTO episode_keywords (episode_id, keyword, is_proper_noun) VALUES (?, ?, ?)',
        [id, kw.word, kw.isProperNoun ? 1 : 0]
      );
    }

    return id;
  }

  recall(queryKeywords, currentMessageCount, limit = 10) {
    // Find episodes that share keywords with the query
    const placeholders = queryKeywords.map(() => '?').join(',');
    if (!placeholders) return [];

    const matchingIds = this.db.all(
      `SELECT DISTINCT episode_id FROM episode_keywords WHERE keyword IN (${placeholders})`,
      queryKeywords
    );

    if (matchingIds.length === 0) return [];

    const idList = matchingIds.map(r => r.episode_id);
    const idPlaceholders = idList.map(() => '?').join(',');
    const episodes = this.db.all(
      `SELECT * FROM episodes WHERE id IN (${idPlaceholders})`,
      idList
    );

    // Compute relevance score for each episode
    const queryKwSet = queryKeywords.map(k => ({ word: k, isProperNoun: false }));

    const scored = episodes.map(ep => {
      // Get proper noun status from junction table
      const epKwRows = this.db.all(
        'SELECT keyword, is_proper_noun FROM episode_keywords WHERE episode_id = ?',
        [ep.id]
      );
      const epKeywords = epKwRows.map(r => ({
        word: r.keyword,
        isProperNoun: r.is_proper_noun === 1,
      }));

      const kwScore = keywordMatch(queryKwSet, epKeywords);
      const recency = computeRecency(currentMessageCount - ep.decay_base_time);
      const freq = Math.min(ep.retrieval_count / 10, 1.0);

      const relevance = (kwScore * 0.4) + (ep.emotional_valence * 0.3) +
                        (recency * 0.2) + (freq * 0.1);

      return { ...ep, relevance };
    });

    scored.sort((a, b) => b.relevance - a.relevance);
    const topResults = scored.slice(0, limit);

    // Increment retrieval count for returned episodes
    for (const ep of topResults) {
      this.db.run(
        'UPDATE episodes SET retrieval_count = retrieval_count + 1, last_retrieved = ? WHERE id = ?',
        [Date.now(), ep.id]
      );
    }

    return topResults;
  }

  getUnconsolidated(limit = 50) {
    return this.db.all(
      'SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
  }

  markConsolidated(episodeIds) {
    for (const id of episodeIds) {
      this.db.run('UPDATE episodes SET consolidated = 1 WHERE id = ?', [id]);
    }
  }

  deleteEpisode(id) {
    this.db.run('DELETE FROM episodes WHERE id = ?', [id]);
  }

  getEpisodeById(id) {
    return this.db.get('SELECT * FROM episodes WHERE id = ?', [id]);
  }

  updateEpisodeContent(id, newContent) {
    const keywords = extractKeywords(newContent);
    const keywordsJson = JSON.stringify(keywords.map(k => k.word));
    this.db.run('UPDATE episodes SET content = ?, keywords = ? WHERE id = ?', [newContent, keywordsJson, id]);
    // Refresh junction table
    this.db.run('DELETE FROM episode_keywords WHERE episode_id = ?', [id]);
    for (const kw of keywords) {
      this.db.run(
        'INSERT OR IGNORE INTO episode_keywords (episode_id, keyword, is_proper_noun) VALUES (?, ?, ?)',
        [id, kw.word, kw.isProperNoun ? 1 : 0]
      );
    }
  }
}

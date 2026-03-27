// core/processes/Reconsolidation.js — Memory update on retrieval

export class Reconsolidation {
  constructor() {
    this.labileSet = new Set();
  }

  markLabile(episodeId) {
    this.labileSet.add(episodeId);
  }

  isLabile(episodeId) {
    return this.labileSet.has(episodeId);
  }

  /**
   * Update a labile episode with new context.
   * Returns true if updated, false if episode was not labile.
   */
  update(episodeId, newContext, hippocampus) {
    if (!this.labileSet.has(episodeId)) return false;

    const episode = hippocampus.getEpisodeById(episodeId);
    if (!episode) return false;

    // Append new context to existing content
    const updatedContent = `${episode.content} [Update: ${newContext}]`;
    hippocampus.updateEpisodeContent(episodeId, updatedContent);

    // Slight valence boost (surprise/new info)
    const newValence = Math.min(episode.emotional_valence + 0.1, 1.0);
    hippocampus.db.run(
      'UPDATE episodes SET emotional_valence = ? WHERE id = ?',
      [newValence, episodeId]
    );

    // Stabilize
    this.labileSet.delete(episodeId);
    return true;
  }

  stabilizeAll() {
    this.labileSet.clear();
  }

  getLabile() {
    return [...this.labileSet];
  }
}

// core/processes/DecayEngine.js — Ebbinghaus forgetting curve

export class DecayEngine {
  /**
   * Compute current decay strength for an episode.
   * @param {Object} params
   * @param {number} params.messagesSince - Messages since episode was created
   * @param {number} params.valence - Emotional valence 0.0-1.0
   * @param {number} params.retrievals - Number of times retrieved
   * @returns {number} Decay strength 0.0-1.0 (1.0 = perfectly remembered)
   */
  static computeDecay({ messagesSince, valence, retrievals }) {
    const S = 30; // Basis half-life in messages
    const importanceMultiplier = 1 + (valence * 2) + (retrievals * 0.5);
    return Math.exp(-messagesSince / (S * importanceMultiplier));
  }

  /**
   * Run a decay tick: update all episodes, prune those below threshold.
   * @param {Object} db - BrainDatabase instance
   * @param {number} currentMessageCount - Current message counter
   * @param {number} pruneThreshold - Below this strength, episodes get pruned (default: 0.1)
   * @returns {{ pruned: number, updated: number }}
   */
  static tick(db, currentMessageCount, pruneThreshold = 0.1) {
    const episodes = db.all('SELECT id, decay_base_time, emotional_valence, retrieval_count FROM episodes WHERE consolidated = 0');

    let pruned = 0;
    let updated = 0;

    for (const ep of episodes) {
      const messagesSince = currentMessageCount - ep.decay_base_time;
      const strength = DecayEngine.computeDecay({
        messagesSince,
        valence: ep.emotional_valence,
        retrievals: ep.retrieval_count,
      });

      if (strength < pruneThreshold) {
        db.run('DELETE FROM episodes WHERE id = ?', [ep.id]);
        pruned++;
      } else {
        updated++;
      }
    }

    return { pruned, updated };
  }
}

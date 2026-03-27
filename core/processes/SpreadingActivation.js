// core/processes/SpreadingActivation.js — Graph-based associative retrieval

export class SpreadingActivation {
  constructor(temporalLobe) {
    this.temporal = temporalLobe;
  }

  /**
   * Layer-based BFS activation spreading through semantic graph.
   * @param {string} startNodeId - Node to start activation from
   * @param {number} depth - Max layers to spread (default: 3)
   * @param {number} threshold - Min activation to keep (default: 0.2)
   * @returns {Map<string, number>} nodeId → activation level
   */
  activate(startNodeId, depth = 3, threshold = 0.2) {
    const activated = new Map();
    activated.set(startNodeId, 1.0);

    let currentLayer = [startNodeId];

    for (let d = 0; d < depth; d++) {
      const nextLayer = [];

      for (const nodeId of currentLayer) {
        const nodeActivation = activated.get(nodeId);
        const edges = this.temporal.getEdgesFrom(nodeId);

        for (const edge of edges) {
          const newActivation = nodeActivation * edge.weight;
          if (newActivation < threshold) continue;

          // Cycle prevention: only update if new activation is higher
          const existing = activated.get(edge.target_id) || 0;
          if (newActivation > existing) {
            activated.set(edge.target_id, newActivation);
            nextLayer.push(edge.target_id);
          }
        }

        // Also check incoming edges (bidirectional spreading)
        const inEdges = this.temporal.getEdgesTo(nodeId);
        for (const edge of inEdges) {
          const newActivation = nodeActivation * edge.weight;
          if (newActivation < threshold) continue;

          const existing = activated.get(edge.source_id) || 0;
          if (newActivation > existing) {
            activated.set(edge.source_id, newActivation);
            nextLayer.push(edge.source_id);
          }
        }
      }

      currentLayer = nextLayer;
      if (currentLayer.length === 0) break;
    }

    return activated;
  }
}

// core/NeuralBus.js — Central event system (synapses)

export const SIGNALS = {
  SENSORY_INPUT: 'SENSORY_INPUT',
  MEMORY_STORE: 'MEMORY_STORE',
  MEMORY_RECALL: 'MEMORY_RECALL',
  EMOTION_TAG: 'EMOTION_TAG',
  CONSOLIDATE: 'CONSOLIDATE',
  DECAY_TICK: 'DECAY_TICK',
  PATTERN_MATCH: 'PATTERN_MATCH',
  HABIT_TRIGGER: 'HABIT_TRIGGER',
  CONTEXT_READY: 'CONTEXT_READY',
};

export class NeuralBus {
  constructor() {
    this.listeners = new Map();
    this.queue = [];
    this.processing = false;
    this.errors = [];
  }

  on(signal, handler) {
    if (!this.listeners.has(signal)) {
      this.listeners.set(signal, []);
    }
    this.listeners.get(signal).push(handler);
  }

  off(signal, handler) {
    const handlers = this.listeners.get(signal);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  async emit(signal, data) {
    this.queue.push({ signal, data });
    if (!this.processing) {
      await this._processQueue();
    }
  }

  async _processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const { signal, data } = this.queue.shift();
      const handlers = this.listeners.get(signal) || [];
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (err) {
          // Error isolation: log but don't crash the bus
          this.errors.push({ signal, error: err, timestamp: Date.now() });
          console.error(`[NeuralBus] Error in ${signal} handler:`, err.message);
        }
      }
    }
    this.processing = false;
  }

  getErrors() { return this.errors; }
  clearErrors() { this.errors = []; }
}

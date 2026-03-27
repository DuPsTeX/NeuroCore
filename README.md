# NeuroCore Brain v1.0.0

A neuroscience-inspired memory system for SillyTavern that gives AI characters persistent, human-like memory.

## Features

- **6 Brain Regions**: Hippocampus (episodic memory), Amygdala (emotional valence), Temporal Lobe (semantic knowledge graph), Prefrontal Cortex (working memory), Cerebellum (procedural patterns), Basal Ganglia (habit formation)
- **Memory Processes**: Ebbinghaus forgetting curve, spreading activation, 3-phase consolidation (sleep cycles), reconsolidation
- **Keyword-based retrieval** with Jaccard similarity + proper noun bonus (German + English)
- **Per-chat isolated brains** stored via IndexedDB (browser) / SQLite (sql.js WASM)
- **Dashboard UI** with memory explorer, knowledge graph visualization, pattern viewer, settings
- **Import/Export** full brain state as JSON
- **Token budget management** (max 15% of context window)
- **Provider-agnostic** prompt injection via `setExtensionPrompt()`

## Installation

1. Copy this folder into `SillyTavern/public/scripts/extensions/third-party/neurocore/`
2. Run the install script to download sql.js WASM:
   ```bash
   cd neurocore
   bash install.sh
   ```
3. Restart SillyTavern

## Running Tests

```bash
node tests/run-all.js
```

## Architecture

```
NeuroController (Orchestrator)
├── NeuralBus (Event System)
├── BrainDatabase (sql.js + IndexedDB)
├── Regions
│   ├── Hippocampus → Episodic Memory
│   ├── Amygdala → Emotional Analysis
│   ├── TemporalLobe → Semantic Graph
│   ├── PrefrontalCortex → Working Memory + Prompt Assembly
│   ├── Cerebellum → Procedural Patterns
│   └── BasalGanglia → Habit Formation
└── Processes
    ├── DecayEngine → Forgetting Curve
    ├── SpreadingActivation → Associative Retrieval
    ├── Consolidation → Sleep-Cycle Compression
    └── Reconsolidation → Memory Update on Retrieval
```

## License

MIT

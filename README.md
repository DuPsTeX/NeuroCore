# NeuroCore Brain v1.0.0

A neuroscience-inspired memory system for SillyTavern that gives AI characters persistent, human-like memory.

## Features

- **6 Brain Regions**: Hippocampus (episodic memory), Amygdala (emotional valence), Temporal Lobe (semantic knowledge graph), Prefrontal Cortex (working memory), Cerebellum (procedural patterns), Basal Ganglia (habit formation)
- **Memory Processes**: Ebbinghaus forgetting curve, spreading activation, 3-phase consolidation (sleep cycles), reconsolidation
- **🆕 Plot Memory System**: Intelligent narrative plot generation from memories, replacing chat history with cohesive story summaries (50-70% token reduction!)
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
├── PlotGenerator (NEW) → Narrative Plot Generation
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

## Plot Memory (NEW!)

**Plot Memory** transforms how memories are presented to the LLM. Instead of injecting individual memory fragments, it generates a cohesive narrative summary that:

- **Reduces token usage by 50-70%** compared to traditional memory injection
- **Improves context understanding** through structured storytelling
- **Intelligently selects old memories** based on current conversation
- **Tracks emotional arcs** and character development
- **Uses LLM to synthesize** memories into natural language

### Usage

1. Open NeuroCore Settings in SillyTavern
2. Navigate to "Einstellungen" tab
3. Enable "Plot Memory aktivieren"
4. Configure options (episodes, nodes, timespan)
5. Send messages and watch the magic happen!

**Documentation**: See [PLOT_MEMORY_DOCS.md](./PLOT_MEMORY_DOCS.md) for detailed guide.

## License

MIT

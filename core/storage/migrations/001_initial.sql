-- NeuroCore Schema v1

CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL,
  participants TEXT NOT NULL,
  emotional_valence REAL DEFAULT 0.0,
  decay_base_time INTEGER NOT NULL,
  retrieval_count INTEGER DEFAULT 0,
  last_retrieved INTEGER DEFAULT 0,
  consolidated INTEGER DEFAULT 0,
  embedding BLOB DEFAULT NULL
);

CREATE TABLE consolidated_memories (
  id TEXT PRIMARY KEY,
  source_episodes TEXT NOT NULL,
  summary TEXT NOT NULL,
  importance REAL NOT NULL,
  themes TEXT NOT NULL
);

CREATE TABLE semantic_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  properties TEXT NOT NULL,
  confidence REAL DEFAULT 0.5
);

CREATE TABLE semantic_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  PRIMARY KEY (source_id, target_id, relation),
  FOREIGN KEY (source_id) REFERENCES semantic_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES semantic_nodes(id) ON DELETE CASCADE
);

CREATE TABLE emotional_tags (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  type TEXT NOT NULL,
  intensity REAL NOT NULL,
  evidence TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE procedural_patterns (
  id TEXT PRIMARY KEY,
  trigger_desc TEXT NOT NULL,
  trigger_keywords TEXT NOT NULL,
  response TEXT NOT NULL,
  strength REAL DEFAULT 0.1,
  activation_count INTEGER DEFAULT 0,
  last_activated INTEGER DEFAULT 0,
  examples TEXT NOT NULL
);

CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  context TEXT NOT NULL,
  behavior TEXT NOT NULL,
  reward_history TEXT NOT NULL,
  average_reward REAL DEFAULT 0.0,
  strength REAL DEFAULT 0.0
);

CREATE TABLE working_memory_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE consolidation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  phase TEXT NOT NULL,
  details TEXT NOT NULL,
  episodes_processed INTEGER DEFAULT 0
);

CREATE TABLE brain_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE episode_keywords (
  episode_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  is_proper_noun INTEGER DEFAULT 0,
  PRIMARY KEY (episode_id, keyword),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_episode_keywords_keyword ON episode_keywords(keyword);
CREATE INDEX idx_emotional_tags_episode ON emotional_tags(episode_id);
CREATE INDEX idx_episodes_timestamp ON episodes(timestamp);
CREATE INDEX idx_episodes_valence ON episodes(emotional_valence);
CREATE INDEX idx_semantic_nodes_type ON semantic_nodes(type);
CREATE INDEX idx_semantic_nodes_label ON semantic_nodes(label);
CREATE INDEX idx_semantic_edges_source ON semantic_edges(source_id);
CREATE INDEX idx_semantic_edges_target ON semantic_edges(target_id);

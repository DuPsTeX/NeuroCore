-- Migration v2: Add external_id to episodes for deduplication
ALTER TABLE episodes ADD COLUMN external_id TEXT DEFAULT NULL;
CREATE UNIQUE INDEX idx_episodes_external_id ON episodes(external_id) WHERE external_id IS NOT NULL;

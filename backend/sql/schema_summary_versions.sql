CREATE TABLE summary_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id     UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  version_number INT  NOT NULL,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (summary_id, version_number)
);

CREATE INDEX summary_versions_summary_id_idx ON summary_versions (summary_id);

-- Run once in Neon console AFTER schema_summary_versions.sql is applied.
-- Seeds existing summaries as version 1, then removes the now-redundant content column.

INSERT INTO summary_versions (summary_id, version_number, content, created_at)
SELECT id, 1, content, created_at FROM summaries;

ALTER TABLE summaries DROP COLUMN content;

-- ─── summary_versions migration (run once after initial schema is applied) ────
-- ALTER TABLE summary_versions
--   ADD COLUMN IF NOT EXISTS edit_type TEXT NOT NULL DEFAULT 'initial'
--     CHECK (edit_type IN ('initial', 'structure', 'content')),
--   ADD COLUMN IF NOT EXISTS source_chunk_ids UUID[] NOT NULL DEFAULT '{}';
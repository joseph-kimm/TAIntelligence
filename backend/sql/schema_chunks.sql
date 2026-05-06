-- Run this in your Neon console (or via psql) after the main schema.sql.
-- Requires the pgvector extension, which is already enabled in schema.sql.

-- ─── parent_chunks ────────────────────────────────────────────────────────────
-- Each row is a parent chunk whose text is the concatenation of 4 consecutive
-- child chunks.  No embedding is stored here; retrieval targets child chunks,
-- and parent text is fetched for LLM context in small-to-big mode.
CREATE TABLE parent_chunks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT         NOT NULL,   -- 0-based index of this parent within its document
    text        TEXT        NOT NULL,   -- concatenation of child chunk texts
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON parent_chunks(document_id);


-- ─── child_chunks ─────────────────────────────────────────────────────────────
-- Each row is one chunk of text cut from a document.
-- Storing chunks separately from embeddings lets you read chunk text without
-- loading the high-dimensional vector data.
CREATE TABLE child_chunks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_chunk_id UUID        NOT NULL REFERENCES parent_chunks(id) ON DELETE CASCADE,
    chunk_index     INT         NOT NULL,   -- 0-based position within document
    text            TEXT        NOT NULL,
    token_count     INT         NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON child_chunks(document_id);
CREATE INDEX ON child_chunks(parent_chunk_id);


-- ─── chunk_embeddings ─────────────────────────────────────────────────────────
-- Each row holds the 384-dimension vector produced by BGE-small-en-v1.5 for
-- the corresponding child chunk.  Stored separately so you can re-embed without
-- touching the chunk text table.
CREATE TABLE chunk_embeddings (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id  UUID        NOT NULL REFERENCES child_chunks(id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL      -- BGE-small-en-v1.5 always outputs 384 floats
);

-- HNSW builds a layered graph incrementally as rows are inserted.
-- No tuning needed, works on empty tables, and gives better recall than ivfflat.
CREATE INDEX ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);

-- Run this in your Neon console (or via psql) after the main schema.sql.
-- Requires the pgvector extension, which is already enabled in schema.sql.

-- ─── document_chunks ──────────────────────────────────────────────────────────
-- Each row is one chunk of text cut from a document.
-- Storing chunks separately from embeddings lets you read chunk text without
-- loading the high-dimensional vector data.
CREATE TABLE document_chunks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index  INT         NOT NULL,   -- position of this chunk within its document (0-based)
    text         TEXT        NOT NULL,   -- the raw chunk text fed to the embedding model
    token_count  INT,                    -- approximate token count (may be NULL)
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Speed up "give me all chunks for document X" queries
CREATE INDEX ON document_chunks(document_id);


-- ─── chunk_embeddings ─────────────────────────────────────────────────────────
-- Each row holds the 384-dimension vector produced by BGE-small-en-v1.5 for
-- the corresponding chunk.  Stored separately so you can re-embed without
-- touching the chunk text table.
CREATE TABLE chunk_embeddings (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id  UUID        NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    embedding VECTOR(384) NOT NULL      -- BGE-small-en-v1.5 always outputs 384 floats
);

-- HNSW builds a layered graph incrementally as rows are inserted.
-- No tuning needed, works on empty tables, and gives better recall than ivfflat.
CREATE INDEX ON chunk_embeddings USING hnsw (embedding vector_cosine_ops);

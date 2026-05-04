-- StudyRAG database schema
-- Run this once in the Neon SQL editor to set up the database.
-- Re-running is safe — all statements use IF NOT EXISTS.

-- pgvector extension: needed ofor embedding similarity search (RAG phase).
-- Enabling it now so it's available when we get there.
CREATE EXTENSION IF NOT EXISTS vector;

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- ─── courses ────────────────────────────────────────────────────────────────
-- Top-level container. One course = one subject (e.g. "Modernist Architecture").
-- emoji and color are display fields added later via ALTER TABLE.
CREATE TABLE IF NOT EXISTS courses (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── sections ───────────────────────────────────────────────────────────────
-- A named group of documents within a course (e.g. "Week 1: The Bauhaus").
-- position controls display order in the sidebar.
CREATE TABLE IF NOT EXISTS sections (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL,
    position   INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sections_course_id_idx ON sections(course_id);

-- ─── documents ──────────────────────────────────────────────────────────────
-- A single document within a section. source_type is 'file' or 'website'.
-- source_ref holds the R2 object key for files, or the URL for websites.
CREATE TABLE IF NOT EXISTS documents (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id   UUID        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title        TEXT        NOT NULL,
    source_type  TEXT        NOT NULL DEFAULT 'file',
    source_ref   TEXT,
    token_count  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_section_id_idx ON documents(section_id);

-- ─── migration (run once if table already exists without these columns) ───────
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'file';
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_ref TEXT;
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS token_count INTEGER;

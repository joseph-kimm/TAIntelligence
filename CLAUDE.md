# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# T(AI) — AI-Powered Learning Platform

A personal RAG application for studying course materials. Students upload documents organized by courses and sections, then interact with them via chat, summarization, and practice tests.

## Dev Commands

```bash
# Backend (run from /backend)
pip install -e ".[dev]"    # install deps (once)
uvicorn main:app --reload  # start dev server (localhost:8000)

# Frontend (run from /frontend)
npm run dev    # start dev server (localhost:3000)
npm run build  # production build
npm run lint   # run ESLint
```

## Ignored Directories

`miscellaneous/` — ignore this directory entirely.

## Stack

- **Frontend**: Next.js (TypeScript) on Vercel
- **Backend**: FastAPI (Python) on Modal
- **Database**: PostgreSQL + pgvector on Neon
- **File Storage**: Cloudflare R2
- **RAG Framework**: LlamaIndex
- **Embeddings**: sentence-transformers (HuggingFaceEmbedding)
- **LLM**: OpenRouter API (OpenAI-compatible)
- **DB Driver**: asyncpg (raw SQL, no ORM)

## Repo Structure

```
/
├── frontend/        # Next.js app (active)
│   ├── app/         # App Router pages
│   ├── components/  # React components
│   └── lib/         # API client (not yet built)
├── backend/         # FastAPI app (active)
│   ├── routers/     # FastAPI route handlers
│   ├── services/    # Business logic, LlamaIndex pipelines
│   ├── db/          # Raw SQL query functions, one file per domain
│   ├── modal_jobs/  # Modal background functions (ingestion)
│   └── core/        # Config, asyncpg connection pool, R2 client
```

## Data Hierarchy

```
courses → sections → documents → document_chunks → chunk_embeddings
                                                  ↑
                                        child chunks (search)
                                        parent chunks (LLM context)
```

## Key Architectural Decisions

**Retrieval**: LlamaIndex `PGVectorStore` with `hybrid_search=True`. Child chunks are embedded and searched; parent chunks are fetched via `PrevNextNodePostprocessor` for LLM context. Citations reference child chunk location (page, heading, snippet).

**Document filtering**: User selects documents via checkboxes (section/document level). Backend resolves selection to a flat `document_id[]` list, passed as `MetadataFilters` to LlamaIndex at retrieval time — never post-filtered.

**Search modes**: Two retrievers — light (vector only, top-k=5) and deep (hybrid + RRF via `QueryFusionRetriever` + reranker + small-to-big). Agent sits in front and routes based on query complexity.

**Ingestion**: Modal background function triggered on upload. Reads file from R2 → parses text → splits on section boundaries → creates parent/child chunks → embeds → writes to Neon. Updates `ingestion_jobs` table with status.

**Streaming**: Chat responses stream via FastAPI `StreamingResponse` → SSE → frontend `EventSource`. Citations appended after stream completes.

**Summarization**: Uses LlamaIndex `TreeSummarize`. Splits oversized documents on `document_sections` boundaries (not chunk boundaries). Summaries cached in DB with version history; marked stale when new documents are added.

## Implementation Notes

- Socratic chat behavior is prompt engineering — LlamaIndex has no opinion on response style
- Citation markers (`[1]`, `[2]`) are injected via prompt; LlamaIndex returns source nodes separately
- Test question generation and short-answer evaluation are custom prompts, not LlamaIndex features
- No ORM — all queries are raw SQL via asyncpg. Query functions live in `backend/db/`, one file per domain (documents.py, chunks.py, sessions.py, etc.)
- Schema managed with plain SQL files in `backend/sql/` — run manually in Neon console or via psql
- `context_snippet` (wider text window around chunk for citation display) is computed at ingestion time

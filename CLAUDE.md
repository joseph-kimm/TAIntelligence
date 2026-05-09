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
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + pgvector on Neon
- **File Storage**: Cloudflare R2
- **RAG Framework**: LlamaIndex
- **Embeddings**: BAAI/bge-small-en-v1.5 via HuggingFaceEmbedding (384-dim)
- **LLM**: OpenRouter API (OpenAI-compatible)
- **DB Driver**: asyncpg (raw SQL, no ORM)

## Repo Structure

```
/
├── frontend/
│   ├── app/                        # App Router pages
│   │   ├── (dashboard)/            # Course grid and per-course views
│   │   └── api/                    # Next.js route handlers (proxy to backend)
│   ├── components/
│   │   ├── chat/                   # ChatTab, MessageBubble, CitationPopover
│   │   ├── course/                 # CourseCard
│   │   ├── layout/                 # CourseSidebar, CourseTabBar
│   │   ├── modals/                 # CreateCourseModal, AddDocumentModal
│   │   ├── summarize/              # SummarizeTab
│   │   └── test/                   # TestTab
│   ├── lib/
│   │   ├── api.ts                  # apiFetch() wrapper, ApiError class
│   │   ├── streaming.ts            # SSE parser, SseEvent types, toMessage()
│   │   ├── actions.ts              # Server actions
│   │   ├── queries.ts              # Data fetching helpers
│   │   └── uploads.ts              # File upload helpers
│   └── types/index.ts              # All shared TypeScript interfaces
└── backend/
    ├── main.py                     # FastAPI app, router registration
    ├── routers/                    # Route handlers (one file per domain)
    │   ├── chat.py
    │   ├── courses.py
    │   ├── documents.py
    │   ├── sections.py
    │   └── summaries.py
    ├── services/                   # Business logic
    │   ├── llm.py                  # OpenRouter calls, prompt construction, streaming
    │   ├── summarization.py        # Summarization orchestration (single + batch paths)
    │   ├── ingestion.py            # PDF/DOCX/TXT parsing, chunking, embedding
    │   └── response_parser.py      # Citation validation and parsing
    ├── schemas/
    │   └── chat.py                 # Pydantic request/response models
    ├── db/                         # Raw SQL query functions (one file per domain)
    │   ├── chats.py
    │   ├── chunks.py
    │   ├── courses.py
    │   ├── documents.py
    │   ├── sections.py
    │   └── summaries.py
    └── core/                       # Config, DB connection pool, R2 client
        ├── config.py
        ├── db.py
        └── r2.py
```

## Data Hierarchy

```
courses → sections → documents → document_chunks → chunk_embeddings
                                                  ↑
                                        child chunks (search)
                                        parent chunks (LLM context)
```

## API Endpoints

All routes prefixed with `/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/courses` | List / create courses |
| GET/POST | `/courses/{id}/sections` | List / create sections |
| GET/POST | `/sections/{id}/documents` | List / upload documents |
| GET/DELETE | `/documents/{id}` | Get / delete document |
| GET | `/documents/{id}/ingestion-status` | Poll ingestion status |
| GET/POST | `/courses/{id}/chats` | List / create chats |
| DELETE | `/chats/{id}` | Delete chat |
| POST | `/chats/{id}/messages` | Send message → SSE stream |
| PATCH | `/chats/{id}/messages/{id}` | Edit message → re-stream |
| POST | `/courses/{id}/summaries` | Create summary |
| GET | `/courses/{id}/summaries` | List summaries |
| PATCH | `/summaries/{id}` | Refine summary |
| DELETE | `/summaries/{id}` | Delete summary |

## Streaming Architecture (Chat)

- Backend returns `StreamingResponse` with SSE (`data: <json>\n\n`)
- Four event types: `user_message` (saved immediately), `delta` (token), `done` (final message with citations), `error`
- Frontend (`streaming.ts`) implements custom SSE parsing with buffer handling — no library
- Message edits delete all subsequent messages then re-stream a fresh response

## Citation System

- System prompt instructs LLM to inline citations as `<<chunk_id>>` (not `[1]` footnotes)
- `response_parser.py` validates cited IDs against retrieved chunks, strips hallucinated ones
- Backend returns `cited_chunks` list alongside message content
- Frontend renders citations as interactive popovers via `CitationPopover`

## Summarization

- `SummaryOptions`: detail_level (0–5), audience (0–3), style, tone, focus_emphasis
- **Single-prompt path**: total tokens < ~60% of context limit
- **Batch path**: 20 chunks/batch, batches processed in parallel, then combined
- LLM must return `{"title": ..., "content": ...}` JSON; parser strips markdown fences
- Summaries can be refined after creation via PATCH

## Implementation Notes

- No ORM — raw SQL via asyncpg. Query functions in `backend/db/`, one file per domain
- Schema managed with plain SQL files in `backend/sql/` — run manually in Neon console or via psql
- Pydantic schemas use camelCase via `alias_generator=to_camel` (snake_case in Python, camelCase over the wire)
- `BACKEND_URL` env var is server-side only (no `NEXT_PUBLIC_` prefix) — API calls go through Next.js route handlers
- `context_snippet` (wider text window for citation display) is computed at ingestion time
- Ingestion runs synchronously in the request (no background job queue currently)
- Test question generation and short-answer evaluation are custom prompts, not LlamaIndex features

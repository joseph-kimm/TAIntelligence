# T(AI)

An AI-powered study platform for university courses. Upload lecture notes, textbooks, and slides organized by course, then interact with them through RAG-based chat, AI-generated summaries, and auto-graded practice tests.

[Live Demo](https://tai-frontend.vercel.app/)

```
TAIntelligence/
├── frontend/     # Next.js web app (TypeScript)
└── backend/      # FastAPI server (Python)
```

---

## Features

- **Chat** — Ask questions about your course material; answers cite source chunks inline
- **Summarize** — Generate summaries with configurable detail level, audience, style, and tone
- **Practice Tests** — Auto-generated MCQ + free-response questions graded by AI
- **Document Management** — Upload PDFs, DOCX, and TXT files organized into courses and sections
- **Streaming** — All AI responses stream token-by-token via SSE

---

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | Next.js (App Router), TypeScript                        |
| Backend    | FastAPI (Python)                                        |
| Database   | PostgreSQL + pgvector (Neon)                            |
| File Storage | Cloudflare R2                                         |
| RAG        | LlamaIndex + BAAI/bge-small-en-v1.5 (384-dim embeddings) |
| LLM        | OpenRouter API (OpenAI-compatible)                      |
| Deployment | Vercel (frontend) + Modal (backend)                     |

---

## Getting Started

### Backend

```bash
cd backend
pip install -e ".[dev]"
cp .env.example .env   # fill in credentials
uvicorn main:app --reload
```

Key environment variables:

```env
DATABASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
HF_TOKEN=
OPENROUTER_KEY=
OPENROUTER_MODEL=
MODEL_CONTEXT_LIMIT=
CORS_ORIGINS=http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set BACKEND_URL
npm run dev
```

### Deploy Backend to Modal

```bash
cd backend
pip install modal
modal deploy modal_app.py
```

---

## License

MIT

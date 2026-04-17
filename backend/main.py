from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.db import close_pool, create_pool
from routers import courses


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs setup before the server accepts requests, and teardown after it stops.
    This is FastAPI's recommended pattern — replaces the old @app.on_event hooks.

    On startup:  open the DB connection pool, store it on app.state so routes
                 can access it via request.app.state.pool.
    On shutdown: close all connections cleanly.
    """
    app.state.pool = await create_pool(settings.database_url)
    yield  # server is running — everything above yield is startup, below is shutdown
    await close_pool(app.state.pool)


app = FastAPI(title="T(AI) API", lifespan=lifespan)

# Allow the Next.js frontend to call this API from the browser.
# Without this, browsers block cross-origin requests (different port = different origin).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers — each router groups related endpoints together.
# The /api prefix is added here so all endpoints live under /api/...
app.include_router(courses.router, prefix="/api")


@app.get("/health")
async def health():
    """
    Quick sanity check — returns whether the server is up and the DB is reachable.
    Hit this first after starting the server: curl http://localhost:8000/health
    """
    try:
        async with app.state.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        # DB is unreachable but the server itself is still running
        return {"status": "ok", "db": "error", "detail": str(e)}

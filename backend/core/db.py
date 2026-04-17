import asyncpg


async def create_pool(dsn: str) -> asyncpg.Pool:
    """
    Open a pool of up to 10 reusable database connections.
    Called once at app startup via the FastAPI lifespan handler.
    min_size=1 keeps one connection warm so the first request isn't slow.
    """
    return await asyncpg.create_pool(dsn, min_size=1, max_size=10)


async def close_pool(pool: asyncpg.Pool) -> None:
    """
    Gracefully close all connections in the pool.
    Called once at app shutdown via the FastAPI lifespan handler.
    """
    await pool.close()

import asyncpg


async def list_courses(pool: asyncpg.Pool) -> list[dict]:
    """Return all courses ordered by most recently updated."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id::text, title, updated_at
            FROM courses
            ORDER BY updated_at DESC
        """)
    return [dict(row) for row in rows]


async def get_course(pool: asyncpg.Pool, course_id: str) -> dict | None:
    """Return a single course by ID, or None if it doesn't exist."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id::text, title, updated_at
            FROM courses
            WHERE id = $1::uuid
        """, course_id)
    return dict(row) if row else None


async def create_course(pool: asyncpg.Pool, title: str) -> dict:
    """Insert a new course and return the created row."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO courses (title)
            VALUES ($1)
            RETURNING id::text, title, updated_at
        """, title)
    return dict(row)


async def rename_course(pool: asyncpg.Pool, course_id: str, title: str) -> dict | None:
    """Rename a course. Returns the updated row, or None if not found."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE courses SET title = $1, updated_at = NOW()
            WHERE id = $2::uuid
            RETURNING id::text, title, updated_at
        """, title, course_id)
    return dict(row) if row else None


async def delete_course(pool: asyncpg.Pool, course_id: str) -> bool:
    """Delete a course. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM courses WHERE id = $1::uuid
        """, course_id)
    return result == "DELETE 1"


async def get_r2_keys_for_course(pool: asyncpg.Pool, course_id: str) -> list[str]:
    """Return R2 keys for all file documents in a course (used before deleting the course)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.source_ref FROM documents d
            JOIN sections s ON s.id = d.section_id
            WHERE s.course_id = $1::uuid AND d.source_type = 'file' AND d.source_ref IS NOT NULL
        """, course_id)
    return [row["source_ref"] for row in rows]

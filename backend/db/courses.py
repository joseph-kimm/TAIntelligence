import asyncpg
import json


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


async def list_sections_with_documents(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    """
    Return all sections for a course, each with its documents nested inside.

    json_agg() bundles each section's documents into a JSON array in one query,
    avoiding a separate DB round-trip per section.
    FILTER (WHERE d.id IS NOT NULL) prevents a [null] entry when a section is empty.
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                s.id::text,
                s.title,
                s.position,
                COALESCE(
                    json_agg(
                        json_build_object('id', d.id::text, 'title', d.title)
                        ORDER BY d.created_at
                    ) FILTER (WHERE d.id IS NOT NULL),
                    '[]'::json
                ) AS documents
            FROM sections s
            LEFT JOIN documents d ON d.section_id = s.id
            WHERE s.course_id = $1::uuid
            GROUP BY s.id, s.title, s.position
            ORDER BY s.position, s.created_at
        """, course_id)

    result = []
    for row in rows:
        d = dict(row)
        # asyncpg returns json_agg results as a raw JSON string, not a Python list.
        # Parse it here so Pydantic receives the list it expects.
        if isinstance(d.get('documents'), str):
            d['documents'] = json.loads(d['documents'])
        result.append(d)
    return result

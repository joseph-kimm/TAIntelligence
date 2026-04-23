import asyncpg
import json


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
        if isinstance(d.get("documents"), str):
            d["documents"] = json.loads(d["documents"])
        result.append(d)
    return result


async def create_section(pool: asyncpg.Pool, course_id: str, title: str) -> dict:
    """Insert a new section at the end of the course and return the created row."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO sections (course_id, title, position)
            VALUES (
                $1::uuid,
                $2,
                COALESCE((SELECT MAX(position) FROM sections WHERE course_id = $1::uuid), -1) + 1
            )
            RETURNING id::text, title, position
        """, course_id, title)
    return dict(row)


async def rename_section(pool: asyncpg.Pool, section_id: str, title: str) -> dict | None:
    """Rename a section. Returns the updated row, or None if not found."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE sections SET title = $1
            WHERE id = $2::uuid
            RETURNING id::text, title
        """, title, section_id)
    return dict(row) if row else None


async def delete_section(pool: asyncpg.Pool, section_id: str) -> bool:
    """Delete a section. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM sections WHERE id = $1::uuid
        """, section_id)
    return result == "DELETE 1"


async def get_r2_keys_for_section(pool: asyncpg.Pool, section_id: str) -> list[str]:
    """Return R2 keys for all file documents in a section (used before deleting the section)."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT source_ref FROM documents
            WHERE section_id = $1::uuid AND source_type = 'file' AND source_ref IS NOT NULL
        """, section_id)
    return [row["source_ref"] for row in rows]

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
    """Return R2 keys for all file documents in a section."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT source_ref FROM documents
            WHERE section_id = $1::uuid AND source_type = 'file' AND source_ref IS NOT NULL
        """, section_id)
    return [row["source_ref"] for row in rows]


async def get_r2_keys_for_course(pool: asyncpg.Pool, course_id: str) -> list[str]:
    """Return R2 keys for all file documents in a course."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT d.source_ref FROM documents d
            JOIN sections s ON s.id = d.section_id
            WHERE s.course_id = $1::uuid AND d.source_type = 'file' AND d.source_ref IS NOT NULL
        """, course_id)
    return [row["source_ref"] for row in rows]


async def get_document(pool: asyncpg.Pool, document_id: str) -> dict | None:
    """Return a single document by ID, or None if it doesn't exist."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id::text, title, source_type, source_ref
            FROM documents
            WHERE id = $1::uuid
        """, document_id)
    return dict(row) if row else None


async def rename_document(pool: asyncpg.Pool, document_id: str, title: str) -> dict | None:
    """Rename a document. Returns the updated row, or None if not found."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE documents SET title = $1
            WHERE id = $2::uuid
            RETURNING id::text, title
        """, title, document_id)
    return dict(row) if row else None


async def delete_document(pool: asyncpg.Pool, document_id: str) -> bool:
    """Delete a document. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM documents WHERE id = $1::uuid
        """, document_id)
    return result == "DELETE 1"


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


async def create_document(
    pool: asyncpg.Pool,
    section_id: str,
    title: str,
    source_type: str,
    source_ref: str | None,
) -> dict:
    """Insert a new document record and return the created row."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO documents (section_id, title, source_type, source_ref)
            VALUES ($1::uuid, $2, $3, $4)
            RETURNING id::text, title, source_type, source_ref
        """, section_id, title, source_type, source_ref)
    return dict(row)


async def set_document_source_ref(pool: asyncpg.Pool, doc_id: str, source_ref: str) -> None:
    """Update the source_ref on a document after the file has been uploaded to R2."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE documents SET source_ref = $1 WHERE id = $2::uuid
        """, source_ref, doc_id)


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

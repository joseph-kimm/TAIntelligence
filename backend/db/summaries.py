import asyncpg


async def create_summary(
    pool: asyncpg.Pool,
    course_id: str,
    document_id: str,
    title: str,
    content: str,
    source_document_ids: list[str],
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO summaries (course_id, document_id, title, content, source_document_ids)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid[])
            RETURNING id::text, course_id::text, document_id::text,
                      title, content,
                      ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                      created_at
            """,
            course_id, document_id, title, content, source_document_ids,
        )
    return dict(row)


async def list_summaries_by_course(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, course_id::text, document_id::text,
                   title, content,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   created_at
            FROM summaries
            WHERE course_id = $1::uuid
            ORDER BY created_at DESC
            """,
            course_id,
        )
    return [dict(row) for row in rows]


async def get_summary(pool: asyncpg.Pool, summary_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text, course_id::text, document_id::text,
                   title, content,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   created_at
            FROM summaries
            WHERE id = $1::uuid
            """,
            summary_id,
        )
    return dict(row) if row else None


async def update_summary(
    pool: asyncpg.Pool,
    summary_id: str,
    title: str,
    content: str,
) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE summaries SET title = $2, content = $3
            WHERE id = $1::uuid
            RETURNING id::text, course_id::text, document_id::text,
                      title, content,
                      ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                      created_at
            """,
            summary_id, title, content,
        )
    return dict(row) if row else None


async def delete_summary(pool: asyncpg.Pool, summary_id: str) -> str | None:
    """Delete the summary and return its document_id (if any) so the caller can clean up."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "DELETE FROM summaries WHERE id = $1::uuid RETURNING document_id::text",
            summary_id,
        )
    return row["document_id"] if row else None

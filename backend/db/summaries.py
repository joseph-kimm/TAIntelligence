import asyncpg

# All queries that return a summary row join with the latest version to include content.
_SUMMARY_COLS = """
    s.id::text,
    s.course_id::text,
    s.title,
    sv.content,
    sv.version_number AS current_version_number,
    ARRAY(SELECT unnest(s.source_document_ids)::text) AS source_document_ids,
    s.created_at
"""

_LATEST_VERSION_JOIN = """
    JOIN summary_versions sv
      ON sv.summary_id = s.id
     AND sv.version_number = (
           SELECT MAX(version_number) FROM summary_versions WHERE summary_id = s.id
         )
"""


async def create_summary(
    pool: asyncpg.Pool,
    course_id: str,
    title: str,
    content: str,
    source_document_ids: list[str],
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO summaries (course_id, title, source_document_ids)
            VALUES ($1::uuid, $2, $3::uuid[])
            RETURNING id::text, course_id::text, title,
                      ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                      created_at
            """,
            course_id, title, source_document_ids,
        )
        summary = dict(row)
        await conn.execute(
            """
            INSERT INTO summary_versions (summary_id, version_number, content, edit_type, source_chunk_ids)
            VALUES ($1::uuid, 1, $2, 'initial', '{}')
            """,
            summary["id"], content,
        )
    summary["content"] = content
    summary["current_version_number"] = 1
    return summary


async def list_summaries_by_course(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {_SUMMARY_COLS}
            FROM summaries s
            {_LATEST_VERSION_JOIN}
            WHERE s.course_id = $1::uuid
            ORDER BY s.created_at DESC
            """,
            course_id,
        )
    return [dict(row) for row in rows]


async def get_summary(pool: asyncpg.Pool, summary_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            SELECT {_SUMMARY_COLS}
            FROM summaries s
            {_LATEST_VERSION_JOIN}
            WHERE s.id = $1::uuid
            """,
            summary_id,
        )
    return dict(row) if row else None


async def delete_summary(pool: asyncpg.Pool, summary_id: str) -> bool:
    """Delete the summary. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM summaries WHERE id = $1::uuid",
            summary_id,
        )
    return result == "DELETE 1"


async def create_summary_version(
    pool: asyncpg.Pool,
    summary_id: str,
    content: str,
    edit_type: str = "initial",
    source_chunk_ids: list[str] | None = None,
) -> dict:
    chunk_ids = source_chunk_ids or []
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO summary_versions (summary_id, version_number, content, edit_type, source_chunk_ids)
            VALUES (
              $1::uuid,
              (SELECT COALESCE(MAX(version_number), 0) + 1
               FROM summary_versions WHERE summary_id = $1::uuid),
              $2,
              $3,
              $4::uuid[]
            )
            RETURNING id::text, summary_id::text, version_number, created_at
            """,
            summary_id, content, edit_type, chunk_ids,
        )
    return dict(row)


async def list_summary_versions(pool: asyncpg.Pool, summary_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, summary_id::text, version_number, edit_type, created_at
            FROM summary_versions
            WHERE summary_id = $1::uuid
            ORDER BY version_number DESC
            """,
            summary_id,
        )
    return [dict(row) for row in rows]


async def get_summary_version_content(
    pool: asyncpg.Pool,
    summary_id: str,
    version_id: str,
) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text, summary_id::text, version_number, content, created_at
            FROM summary_versions
            WHERE id = $1::uuid AND summary_id = $2::uuid
            """,
            version_id, summary_id,
        )
    return dict(row) if row else None

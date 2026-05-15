import asyncpg


async def get_document(pool: asyncpg.Pool, document_id: str) -> dict | None:
    """Return a single document by ID, or None if it doesn't exist."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id::text, title, source_type, source_ref, token_count
            FROM documents
            WHERE id = $1::uuid
        """, document_id)
    return dict(row) if row else None


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
            RETURNING id::text, title, source_type, source_ref, token_count
        """, section_id, title, source_type, source_ref)
    return dict(row)


async def update_document_after_ingestion(pool: asyncpg.Pool, document_id: str, token_count: int, full_text: str) -> None:
    """Set token_count and full_text on a document after ingestion completes."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE documents SET token_count = $1, full_text = $2 WHERE id = $3::uuid
        """, token_count, full_text, document_id)


async def mark_document_ingestion_failed(pool: asyncpg.Pool, document_id: str) -> None:
    """Mark a document as failed. Uses token_count = -1 as a sentinel value."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE documents SET token_count = -1 WHERE id = $1::uuid
        """, document_id)


async def set_document_source_ref(pool: asyncpg.Pool, doc_id: str, source_ref: str) -> None:
    """Update the source_ref on a document after the file has been uploaded to R2."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE documents SET source_ref = $1 WHERE id = $2::uuid
        """, source_ref, doc_id)


async def rename_document(pool: asyncpg.Pool, document_id: str, title: str) -> dict | None:
    """Rename a document. Returns the updated row, or None if not found."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE documents SET title = $1
            WHERE id = $2::uuid
            RETURNING id::text, title
        """, title, document_id)
    return dict(row) if row else None


async def get_document_ingestion_status(pool: asyncpg.Pool, document_id: str) -> str | None:
    """Return 'pending', 'complete', or 'failed', or None if the document doesn't exist."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                source_type,
                token_count,
                EXISTS (SELECT 1 FROM child_chunks WHERE document_id = d.id) AS has_chunks
            FROM documents d
            WHERE id = $1::uuid
        """, document_id)
    if row is None:
        return None
    if row["source_type"] == "website":
        return "complete"
    if row["has_chunks"]:
        return "complete"
    if row["token_count"] == -1:
        return "failed"
    return "pending"


async def get_total_token_count(pool: asyncpg.Pool, document_ids: list[str]) -> int:
    """Return the sum of token_count for the given document IDs."""
    async with pool.acquire() as conn:
        result = await conn.fetchval(
            "SELECT COALESCE(SUM(token_count), 0) FROM documents WHERE id = ANY($1::uuid[])",
            document_ids,
        )
    return int(result)


async def get_parent_chunks_for_documents(
    pool: asyncpg.Pool, document_ids: list[str]
) -> list[dict]:
    """Return parent chunks for the given documents, ordered by document then chunk position."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT document_id::text, chunk_index, text
            FROM parent_chunks
            WHERE document_id = ANY($1::uuid[])
            ORDER BY document_id, chunk_index
            """,
            document_ids,
        )
    return [dict(row) for row in rows]


async def get_full_texts_for_documents(
    pool: asyncpg.Pool, document_ids: list[str]
) -> list[dict]:
    """Return id, title, full_text for the given documents, ordered by title."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id::text, title, full_text
            FROM documents
            WHERE id = ANY($1::uuid[])
            ORDER BY title
        """, document_ids)
    return [dict(row) for row in rows]


async def move_document(pool: asyncpg.Pool, document_id: str, section_id: str) -> dict | None:
    """Move a document to a different section. Returns updated row, or None if not found."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            UPDATE documents SET section_id = $1::uuid
            WHERE id = $2::uuid
            RETURNING id::text, title
        """, section_id, document_id)
    return dict(row) if row else None


async def delete_document(pool: asyncpg.Pool, document_id: str) -> bool:
    """Delete a document. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM documents WHERE id = $1::uuid
        """, document_id)
    return result == "DELETE 1"

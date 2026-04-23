import asyncpg


async def get_document(pool: asyncpg.Pool, document_id: str) -> dict | None:
    """Return a single document by ID, or None if it doesn't exist."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id::text, title, source_type, source_ref
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
            RETURNING id::text, title, source_type, source_ref
        """, section_id, title, source_type, source_ref)
    return dict(row)


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


async def delete_document(pool: asyncpg.Pool, document_id: str) -> bool:
    """Delete a document. Returns True if a row was deleted."""
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM documents WHERE id = $1::uuid
        """, document_id)
    return result == "DELETE 1"

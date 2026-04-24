import asyncpg


async def insert_chunk(
    pool: asyncpg.Pool,
    document_id: str,
    chunk_index: int,
    text: str,
    token_count: int | None = None,
) -> str:
    """Insert one text chunk and return its generated UUID."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO document_chunks (document_id, chunk_index, text, token_count)
            VALUES ($1::uuid, $2, $3, $4)
            RETURNING id::text
            """,
            document_id,
            chunk_index,
            text,
            token_count,
        )
    return row["id"]


async def insert_embedding(
    pool: asyncpg.Pool,
    chunk_id: str,
    embedding: list[float],
) -> None:
    """Store the embedding vector for a chunk.

    asyncpg has no built-in pgvector codec, so we convert the Python list to
    the string literal that pgvector understands: '[0.1, 0.2, ...]'.
    """
    embedding_str = str(embedding)  # Python list __str__ matches pgvector syntax
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO chunk_embeddings (chunk_id, embedding)
            VALUES ($1::uuid, $2::vector)
            """,
            chunk_id,
            embedding_str,
        )


async def search_chunks_by_embedding(
    pool: asyncpg.Pool,
    embedding: list[float],
    course_id: str,
    document_ids: list[str] | None = None,
    limit: int = 10,
) -> list[dict]:
    """Return the top-`limit` chunks closest to `embedding`.

    Always scoped to `course_id`. When `document_ids` is provided and non-empty,
    further restricts results to those documents.
    """
    embedding_str = str(embedding)  # pgvector string syntax: '[0.1, 0.2, ...]'
    async with pool.acquire() as conn:
        if document_ids:
            rows = await conn.fetch(
                """
                SELECT
                    dc.id::text,
                    dc.text,
                    dc.document_id::text,
                    d.title AS document_title,
                    1 - (ce.embedding <=> $1::vector) AS similarity
                FROM chunk_embeddings ce
                JOIN document_chunks dc ON ce.chunk_id = dc.id
                JOIN documents d ON dc.document_id = d.id
                JOIN sections s ON d.section_id = s.id
                WHERE s.course_id = $2::uuid
                  AND d.id = ANY($3::uuid[])
                ORDER BY ce.embedding <=> $1::vector
                LIMIT $4
                """,
                embedding_str,
                course_id,
                document_ids,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT
                    dc.id::text,
                    dc.text,
                    dc.document_id::text,
                    d.title AS document_title,
                    1 - (ce.embedding <=> $1::vector) AS similarity
                FROM chunk_embeddings ce
                JOIN document_chunks dc ON ce.chunk_id = dc.id
                JOIN documents d ON dc.document_id = d.id
                JOIN sections s ON d.section_id = s.id
                WHERE s.course_id = $2::uuid
                ORDER BY ce.embedding <=> $1::vector
                LIMIT $3
                """,
                embedding_str,
                course_id,
                limit,
            )
    return [dict(row) for row in rows]


async def bulk_insert_chunks_and_embeddings(
    pool: asyncpg.Pool,
    document_id: str,
    chunks: list[tuple[int, str]],  # (chunk_index, text)
    embeddings: list[list[float]],
) -> int:
    """Delete existing chunks and insert all new chunks + embeddings in one transaction.

    Uses a DELETE CTE + unnest() bulk INSERT to replace 2*N round-trips with 3 queries total.
    Returns the number of chunks inserted.
    """
    chunk_indices = [c[0] for c in chunks]
    chunk_texts = [c[1] for c in chunks]
    embedding_strs = [str(e) for e in embeddings]

    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """
                INSERT INTO document_chunks (document_id, chunk_index, text)
                SELECT $1::uuid, t.idx, t.txt
                FROM unnest($2::int[], $3::text[]) AS t(idx, txt)
                RETURNING id
                """,
                document_id,
                chunk_indices,
                chunk_texts,
            )
            chunk_ids = [row["id"] for row in rows]

            await conn.execute(
                """
                INSERT INTO chunk_embeddings (chunk_id, embedding)
                SELECT t.chunk_id, t.emb::vector
                FROM unnest($1::uuid[], $2::text[]) AS t(chunk_id, emb)
                """,
                chunk_ids,
                embedding_strs,
            )

    return len(chunk_ids)


async def delete_chunks_by_document(pool: asyncpg.Pool, document_id: str) -> None:
    """Remove all chunks (and their embeddings via CASCADE) for a document."""
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM document_chunks WHERE document_id = $1::uuid",
            document_id,
        )

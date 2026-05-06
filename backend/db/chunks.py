import asyncpg


async def search_chunks_by_embedding(
    pool: asyncpg.Pool,
    embedding: list[float],
    course_id: str,
    document_ids: list[str] | None = None,
    limit: int = 10,
) -> list[dict]:
    """Return the top-`limit` child chunks closest to `embedding`.

    Always scoped to `course_id`. When `document_ids` is provided and non-empty,
    further restricts results to those documents.
    """
    embedding_str = str(embedding)
    async with pool.acquire() as conn:
        if document_ids:
            rows = await conn.fetch(
                """
                SELECT
                    cc.id::text,
                    cc.text,
                    cc.document_id::text,
                    d.title AS document_title,
                    1 - (ce.embedding <=> $1::vector) AS similarity
                FROM chunk_embeddings ce
                JOIN child_chunks cc ON ce.chunk_id = cc.id
                JOIN documents d ON cc.document_id = d.id
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
                    cc.id::text,
                    cc.text,
                    cc.document_id::text,
                    d.title AS document_title,
                    1 - (ce.embedding <=> $1::vector) AS similarity
                FROM chunk_embeddings ce
                JOIN child_chunks cc ON ce.chunk_id = cc.id
                JOIN documents d ON cc.document_id = d.id
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


async def bulk_insert_parent_child_chunks(
    pool: asyncpg.Pool,
    document_id: str,
    parent_texts: list[str],
    child_texts: list[str],
    child_token_counts: list[int],
    child_parent_indices: list[int],
    embeddings: list[list[float]],
) -> int:
    """Insert parent chunks, child chunks, and embeddings in one transaction.

    Returns the number of child chunks inserted.
    """
    parent_indices = list(range(len(parent_texts)))
    embedding_strs = [str(e) for e in embeddings]

    async with pool.acquire() as conn:
        async with conn.transaction():
            parent_rows = await conn.fetch(
                """
                INSERT INTO parent_chunks (document_id, chunk_index, text)
                SELECT $1::uuid, t.idx, t.txt
                FROM unnest($2::int[], $3::text[]) AS t(idx, txt)
                RETURNING id
                """,
                document_id,
                parent_indices,
                parent_texts,
            )
            parent_ids = [row["id"] for row in parent_rows]

            child_parent_ids = [parent_ids[i] for i in child_parent_indices]
            child_indices = list(range(len(child_texts)))

            child_rows = await conn.fetch(
                """
                INSERT INTO child_chunks (document_id, parent_chunk_id, chunk_index, text, token_count)
                SELECT $1::uuid, t.parent_id, t.idx, t.txt, t.tc
                FROM unnest($2::uuid[], $3::int[], $4::text[], $5::int[]) AS t(parent_id, idx, txt, tc)
                RETURNING id
                """,
                document_id,
                child_parent_ids,
                child_indices,
                child_texts,
                child_token_counts,
            )
            child_ids = [row["id"] for row in child_rows]

            await conn.execute(
                """
                INSERT INTO chunk_embeddings (chunk_id, embedding)
                SELECT t.chunk_id, t.emb::vector
                FROM unnest($1::uuid[], $2::text[]) AS t(chunk_id, emb)
                """,
                child_ids,
                embedding_strs,
            )

    return len(child_ids)


async def delete_chunks_by_document(pool: asyncpg.Pool, document_id: str) -> None:
    """Remove all parent and child chunks (and embeddings via CASCADE) for a document."""
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM parent_chunks WHERE document_id = $1::uuid",
            document_id,
        )

import json

import asyncpg


async def get_chat_with_messages(pool: asyncpg.Pool, chat_id: str) -> dict | None:
    """Fetch a chat's course_id and its existing messages (role + content only).

    Used by the send/edit endpoints to build conversation history and look up
    the course_id needed for chunk retrieval.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                c.id::text,
                c.course_id::text,
                COALESCE(
                    json_agg(
                        json_build_object('role', m.role, 'content', m.content)
                        ORDER BY m.created_at ASC
                    ) FILTER (WHERE m.id IS NOT NULL),
                    '[]'
                ) AS messages
            FROM chats c
            LEFT JOIN messages m ON m.chat_id = c.id
            WHERE c.id = $1::uuid
            GROUP BY c.id
            """,
            chat_id,
        )
    if row is None:
        return None
    result = dict(row)
    result["messages"] = json.loads(result["messages"])
    return result


async def create_chat(pool: asyncpg.Pool, course_id: str) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO chats (course_id)
            VALUES ($1::uuid)
            RETURNING id::text, course_id::text, created_at
        """, course_id)
    return dict(row)


async def list_chats_with_messages(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                c.id::text,
                c.course_id::text,
                c.created_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id',         m.id::text,
                            'chat_id',    m.chat_id::text,
                            'role',       m.role,
                            'content',    m.content,
                            'chunk_ids',  ARRAY(SELECT elem::text FROM unnest(m.chunk_ids) AS elem),
                            'created_at', m.created_at
                        )
                        ORDER BY m.created_at ASC
                    ) FILTER (WHERE m.id IS NOT NULL),
                    '[]'
                ) AS messages
            FROM chats c
            LEFT JOIN messages m ON m.chat_id = c.id
            WHERE c.course_id = $1::uuid
            GROUP BY c.id
            ORDER BY c.created_at ASC
        """, course_id)
    return [dict(row) for row in rows]


async def delete_chat(pool: asyncpg.Pool, chat_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute("""
            DELETE FROM chats WHERE id = $1::uuid
        """, chat_id)
    return result == "DELETE 1"


async def delete_messages_from(pool: asyncpg.Pool, chat_id: str, message_id: str) -> None:
    """Delete a message and all messages that follow it in the same chat."""
    async with pool.acquire() as conn:
        await conn.execute("""
            DELETE FROM messages
            WHERE chat_id = $1::uuid
            AND created_at >= (
                SELECT created_at FROM messages
                WHERE id = $2::uuid AND chat_id = $1::uuid
            )
        """, chat_id, message_id)


async def add_message(
    pool: asyncpg.Pool,
    chat_id: str,
    role: str,
    content: str,
    chunk_ids: list[str] | None = None,
) -> dict:
    chunk_ids = chunk_ids or []
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO messages (chat_id, role, content, chunk_ids)
            VALUES ($1::uuid, $2, $3, $4::uuid[])
            RETURNING id::text, chat_id::text, role, content,
                      ARRAY(SELECT elem::text FROM unnest(chunk_ids) AS elem) AS chunk_ids,
                      created_at
        """, chat_id, role, content, chunk_ids)
    return dict(row)

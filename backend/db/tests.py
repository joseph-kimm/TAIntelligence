from __future__ import annotations

import json

import asyncpg


async def create_test(
    pool: asyncpg.Pool,
    course_id: str,
    title: str,
    source_document_ids: list[str],
    mcq_count: int,
    frq_count: int,
    purpose: str,
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO tests (course_id, title, source_document_ids, mcq_count, frq_count, purpose)
            VALUES ($1::uuid, $2, $3::uuid[], $4, $5, $6)
            RETURNING id::text, course_id::text, title,
                      ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                      mcq_count, frq_count, purpose, created_at
            """,
            course_id, title, source_document_ids, mcq_count, frq_count, purpose,
        )
    return dict(row)


async def list_tests_by_course(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, course_id::text, title,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   mcq_count, frq_count, purpose, created_at
            FROM tests
            WHERE course_id = $1::uuid
            ORDER BY created_at DESC
            """,
            course_id,
        )
    return [dict(row) for row in rows]


async def delete_test(pool: asyncpg.Pool, test_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM tests WHERE id = $1::uuid",
            test_id,
        )
    return result == "DELETE 1"


async def get_test_with_questions(pool: asyncpg.Pool, test_id: str) -> dict | None:
    async with pool.acquire() as conn:
        test_row = await conn.fetchrow(
            """
            SELECT id::text, course_id::text, title,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   mcq_count, frq_count, purpose, created_at
            FROM tests
            WHERE id = $1::uuid
            """,
            test_id,
        )
        if test_row is None:
            return None

        question_rows = await conn.fetch(
            """
            SELECT id::text, test_id::text, position, question_type, content, learning_objective,
                   ARRAY(SELECT unnest(source_chunk_ids)::text) AS source_chunk_ids
            FROM questions
            WHERE test_id = $1::uuid
            ORDER BY position
            """,
            test_id,
        )

        question_ids = [row["id"] for row in question_rows]

        mcq_rows: list[asyncpg.Record] = []
        frq_rows: list[asyncpg.Record] = []

        if question_ids:
            mcq_rows = await conn.fetch(
                """
                SELECT id::text, question_id::text, position, content, is_correct, explanation
                FROM mcq_options
                WHERE question_id = ANY($1::uuid[])
                ORDER BY question_id, position
                """,
                question_ids,
            )
            frq_rows = await conn.fetch(
                """
                SELECT id::text, question_id::text, ideal_answer, rubric
                FROM frq_answers
                WHERE question_id = ANY($1::uuid[])
                """,
                question_ids,
            )

    # Index options and answers by question_id
    options_by_question: dict[str, list[dict]] = {}
    for opt in mcq_rows:
        o = dict(opt)
        options_by_question.setdefault(o["question_id"], []).append(o)

    answers_by_question: dict[str, dict] = {}
    for ans in frq_rows:
        a = dict(ans)
        rubric = a["rubric"]
        if isinstance(rubric, str):
            rubric = json.loads(rubric)
        a["rubric"] = rubric
        answers_by_question[a["question_id"]] = a

    questions = []
    for q in question_rows:
        qd = dict(q)
        if qd["question_type"] == "mcq":
            qd["options"] = options_by_question.get(qd["id"], [])
        else:
            qd["answer"] = answers_by_question.get(qd["id"])
        questions.append(qd)

    test = dict(test_row)
    test["questions"] = questions
    return test


async def save_questions(
    pool: asyncpg.Pool,
    test_id: str,
    questions: list[dict],
) -> None:
    """Bulk insert questions, mcq_options, and frq_answers in a single transaction.

    Each question dict must have:
      position, question_type, content, learning_objective
      MCQ: options → [{content, is_correct, explanation, position}]
      FRQ: ideal_answer, rubric → [{criterion, points}]
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            for q in questions:
                q_row = await conn.fetchrow(
                    """
                    INSERT INTO questions (test_id, position, question_type, content, learning_objective, source_chunk_ids)
                    VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid[])
                    RETURNING id
                    """,
                    test_id, q["position"], q["question_type"], q["content"],
                    q.get("learning_objective"), q.get("source_chunk_ids", []),
                )
                q_id = q_row["id"]

                if q["question_type"] == "mcq":
                    for opt in q["options"]:
                        await conn.execute(
                            """
                            INSERT INTO mcq_options (question_id, position, content, is_correct, explanation)
                            VALUES ($1, $2, $3, $4, $5)
                            """,
                            q_id, opt["position"], opt["content"], opt["is_correct"], opt.get("explanation"),
                        )
                else:
                    await conn.execute(
                        """
                        INSERT INTO frq_answers (question_id, ideal_answer, rubric)
                        VALUES ($1, $2, $3::jsonb)
                        """,
                        q_id, q.get("ideal_answer"), json.dumps(q.get("rubric", [])),
                    )

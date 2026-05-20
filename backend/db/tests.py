from __future__ import annotations

import json

import asyncpg


# ── Tests ────────────────────────────────────────────────────────────────────

async def create_test(
    pool: asyncpg.Pool,
    course_id: str,
    title: str,
    source_document_ids: list[str],
    purpose: str,
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO tests (course_id, title, source_document_ids, purpose)
            VALUES ($1::uuid, $2, $3::uuid[], $4)
            RETURNING id::text, course_id::text, title,
                      ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                      purpose, all_objectives, created_at
            """,
            course_id, title, source_document_ids, purpose,
        )
    return dict(row)


async def update_test_objectives(pool: asyncpg.Pool, test_id: str, objectives: list[str]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE tests SET all_objectives = $2 WHERE id = $1::uuid",
            test_id, objectives,
        )


async def list_tests_by_course(pool: asyncpg.Pool, course_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        test_rows = await conn.fetch(
            """
            SELECT id::text, course_id::text, title,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   purpose, created_at
            FROM tests
            WHERE course_id = $1::uuid
            ORDER BY created_at DESC
            """,
            course_id,
        )
        if not test_rows:
            return []
        test_ids = [row["id"] for row in test_rows]
        qs_rows = await conn.fetch(
            """
            SELECT id::text, test_id::text, set_number, mcq_count, frq_count, created_at
            FROM question_sets
            WHERE test_id = ANY($1::uuid[])
            ORDER BY test_id, set_number DESC
            """,
            test_ids,
        )

    qs_by_test: dict[str, list[dict]] = {}
    for qs in qs_rows:
        qsd = dict(qs)
        qs_by_test.setdefault(qsd["test_id"], []).append(qsd)

    result = []
    for row in test_rows:
        t = dict(row)
        t["question_sets"] = qs_by_test.get(t["id"], [])
        result.append(t)
    return result


async def delete_test(pool: asyncpg.Pool, test_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM tests WHERE id = $1::uuid",
            test_id,
        )
    return result == "DELETE 1"


# ── Question sets ─────────────────────────────────────────────────────────────

async def create_question_set(
    pool: asyncpg.Pool,
    test_id: str,
    mcq_count: int,
    frq_count: int,
) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO question_sets (test_id, set_number, mcq_count, frq_count)
            VALUES (
                $1::uuid,
                (SELECT COALESCE(MAX(set_number), 0) + 1 FROM question_sets WHERE test_id = $1::uuid),
                $2,
                $3
            )
            RETURNING id::text, test_id::text, set_number, mcq_count, frq_count, created_at
            """,
            test_id, mcq_count, frq_count,
        )
    return dict(row)


async def get_question_set_with_questions(pool: asyncpg.Pool, question_set_id: str) -> dict | None:
    async with pool.acquire() as conn:
        qs_row = await conn.fetchrow(
            """
            SELECT id::text, test_id::text, set_number, created_at
            FROM question_sets
            WHERE id = $1::uuid
            """,
            question_set_id,
        )
        if qs_row is None:
            return None

        question_rows = await conn.fetch(
            """
            SELECT id::text, question_set_id::text, question_type, content,
                   learning_objective,
                   ARRAY(SELECT unnest(source_chunk_ids)::text) AS source_chunk_ids
            FROM questions
            WHERE question_set_id = $1::uuid
            """,
            question_set_id,
        )

        question_ids = [row["id"] for row in question_rows]
        mcq_rows: list[asyncpg.Record] = []
        frq_rows: list[asyncpg.Record] = []

        if question_ids:
            mcq_rows = await conn.fetch(
                """
                SELECT id::text, question_id::text, content, is_correct, explanation
                FROM mcq_answers
                WHERE question_id = ANY($1::uuid[])
                ORDER BY question_id
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

    qs = dict(qs_row)
    qs["questions"] = questions
    return qs


async def get_tested_objectives(pool: asyncpg.Pool, test_id: str) -> list[str]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT q.learning_objective
            FROM questions q
            JOIN question_sets qs ON q.question_set_id = qs.id
            WHERE qs.test_id = $1::uuid
              AND q.learning_objective IS NOT NULL
              AND q.learning_objective != ''
            """,
            test_id,
        )
    return [row["learning_objective"] for row in rows]


async def delete_question_set(pool: asyncpg.Pool, question_set_id: str) -> bool:
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM question_sets WHERE id = $1::uuid",
            question_set_id,
        )
    return result == "DELETE 1"


async def save_questions(
    pool: asyncpg.Pool,
    question_set_id: str,
    questions: list[dict],
) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            for q in questions:
                q_row = await conn.fetchrow(
                    """
                    INSERT INTO questions
                        (question_set_id, question_type, content, learning_objective, source_chunk_ids)
                    VALUES ($1::uuid, $2, $3, $4, $5::uuid[])
                    RETURNING id
                    """,
                    question_set_id, q["question_type"], q["content"],
                    q.get("learning_objective"), q.get("source_chunk_ids", []),
                )
                q_id = q_row["id"]

                if q["question_type"] == "mcq":
                    for opt in q["options"]:
                        await conn.execute(
                            """
                            INSERT INTO mcq_answers (question_id, content, is_correct, explanation)
                            VALUES ($1, $2, $3, $4)
                            """,
                            q_id, opt["content"], opt["is_correct"], opt.get("explanation"),
                        )
                else:
                    await conn.execute(
                        """
                        INSERT INTO frq_answers (question_id, ideal_answer, rubric)
                        VALUES ($1, $2, $3::jsonb)
                        """,
                        q_id, q.get("ideal_answer"), json.dumps(q.get("rubric", [])),
                    )


# ── Attempts ──────────────────────────────────────────────────────────────────

async def create_attempt(pool: asyncpg.Pool, question_set_id: str) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO test_attempts (question_set_id)
            VALUES ($1::uuid)
            RETURNING id::text, question_set_id::text, score, max_score, submitted_at, created_at
            """,
            question_set_id,
        )
    return dict(row)


async def submit_attempt(
    pool: asyncpg.Pool,
    attempt_id: str,
    answers: list[dict],
    score: float,
    max_score: float,
    question_order: list[str],
    option_orders: dict[str, list[str]],
) -> dict:
    async with pool.acquire() as conn:
        async with conn.transaction():
            for a in answers:
                await conn.execute(
                    """
                    INSERT INTO user_answers
                        (attempt_id, question_id, selected_option_id, response_text, score, feedback_text)
                    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
                    """,
                    attempt_id,
                    a["question_id"],
                    a.get("selected_option_id"),
                    a.get("response_text"),
                    a.get("score"),
                    a.get("feedback_text"),
                )
            row = await conn.fetchrow(
                """
                UPDATE test_attempts
                SET score = $2, max_score = $3, submitted_at = now(),
                    question_order = $4::uuid[], option_orders = $5::jsonb
                WHERE id = $1::uuid
                RETURNING id::text, question_set_id::text, score, max_score, submitted_at,
                          question_order, option_orders, created_at
                """,
                attempt_id, score, max_score,
                [qid for qid in question_order],
                json.dumps(option_orders),
            )
    return dict(row)


async def get_attempt(pool: asyncpg.Pool, attempt_id: str) -> dict | None:
    async with pool.acquire() as conn:
        attempt_row = await conn.fetchrow(
            """
            SELECT id::text, question_set_id::text, score, max_score, submitted_at,
                   question_order, option_orders, created_at
            FROM test_attempts
            WHERE id = $1::uuid
            """,
            attempt_id,
        )
        if attempt_row is None:
            return None

        answer_rows = await conn.fetch(
            """
            SELECT id::text, attempt_id::text, question_id::text,
                   selected_option_id::text, response_text, score, feedback_text
            FROM user_answers
            WHERE attempt_id = $1::uuid
            """,
            attempt_id,
        )

    attempt = dict(attempt_row)
    option_orders = attempt.get("option_orders")
    if isinstance(option_orders, str):
        option_orders = json.loads(option_orders)
    attempt["option_orders"] = option_orders or {}
    attempt["question_order"] = list(attempt.get("question_order") or [])
    attempt["answers"] = [dict(r) for r in answer_rows]
    return attempt


async def list_attempts_by_question_set(pool: asyncpg.Pool, question_set_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, question_set_id::text, score, max_score, submitted_at, created_at
            FROM test_attempts
            WHERE question_set_id = $1::uuid
              AND submitted_at IS NOT NULL
            ORDER BY submitted_at DESC
            """,
            question_set_id,
        )
    return [dict(row) for row in rows]

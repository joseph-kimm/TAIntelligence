from __future__ import annotations

import asyncio
import json as json_lib
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.config import settings
from db.tests import (
    create_attempt,
    create_question_set,
    create_test,
    delete_question_set,
    delete_test,
    get_attempt,
    get_question_set_with_questions,
    get_tested_objectives,
    list_attempts_by_question_set,
    list_tests_by_course,
)
from schemas.tests import GenerateTestIn, RegenerateIn, SubmitAttemptIn
from services.grading import run_grading
from services.test_generation import run_test_generation

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


def _streaming_response(coro_factory):
    """Wrap an async factory into an SSE StreamingResponse.

    coro_factory receives on_progress and must return a dict for the done event.
    """
    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(event: dict) -> None:
            await queue.put(("progress", event))

        async def run() -> None:
            try:
                result = await coro_factory(on_progress)
                await queue.put(("done", result))
            except Exception as exc:
                logger.exception("SSE background task failed")
                await queue.put(("error", str(exc)))
            finally:
                await queue.put(None)

        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                event_type, data = item
                if event_type == "progress":
                    payload = json_lib.dumps({"type": "progress", **data})
                elif event_type == "done":
                    payload = json_lib.dumps({"type": "done", **data}, default=str)
                else:
                    payload = json_lib.dumps({"type": "error", "message": data})
                yield f"data: {payload}\n\n"
        finally:
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _fetch_test_row(pool, test_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text, course_id::text, title, purpose,
                   ARRAY(SELECT unnest(source_document_ids)::text) AS source_document_ids,
                   all_objectives
            FROM tests WHERE id = $1::uuid
            """,
            test_id,
        )
    return dict(row) if row else None


async def _fetch_latest_qs_counts(pool, test_id: str) -> tuple[int, int] | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT mcq_count, frq_count
            FROM question_sets WHERE test_id = $1::uuid
            ORDER BY set_number DESC LIMIT 1
            """,
            test_id,
        )
    return (row["mcq_count"], row["frq_count"]) if row else None


# ── Tests ─────────────────────────────────────────────────────────────────────

@router.post("/courses/{course_id}/tests")
async def generate_course_test(course_id: str, body: GenerateTestIn, request: Request):
    _validate_uuid(course_id, "course_id")
    if not body.document_ids:
        raise HTTPException(status_code=422, detail="document_ids must not be empty")
    for doc_id in body.document_ids:
        _validate_uuid(doc_id, "document_id")

    pool = request.app.state.pool
    embed_model = request.app.state.embed_model

    test = await create_test(
        pool,
        course_id=course_id,
        title=body.title,
        source_document_ids=body.document_ids,
        purpose=body.purpose,
    )
    test_id = test["id"]
    question_set = await create_question_set(pool, test_id, body.mcq_count, body.frq_count)
    question_set_id = question_set["id"]
    logger.info("Created test=%s question_set=%s", test_id, question_set_id)

    async def _run(on_progress):
        qs_with_questions = await run_test_generation(
            pool=pool,
            question_set_id=question_set_id,
            test_id=test_id,
            course_id=course_id,
            document_ids=body.document_ids,
            mcq_count=body.mcq_count,
            frq_count=body.frq_count,
            purpose=body.purpose,
            all_objectives=None,
            already_tested=[],
            openrouter_key=settings.openrouter_key,
            model=settings.openrouter_model,
            context_limit=settings.model_context_limit,
            embed_model=embed_model,
            on_progress=on_progress,
        )
        questions = qs_with_questions.get("questions", [])
        logger.info("Test generation done: test=%s questions=%d", test_id, len(questions))
        return {"test": test, "question_set": question_set, "questions": questions}

    return _streaming_response(_run)


@router.get("/courses/{course_id}/tests")
async def list_course_tests(course_id: str, request: Request):
    _validate_uuid(course_id, "course_id")
    return await list_tests_by_course(request.app.state.pool, course_id)


@router.delete("/tests/{test_id}", status_code=204)
async def remove_test(test_id: str, request: Request):
    _validate_uuid(test_id, "test_id")
    found = await delete_test(request.app.state.pool, test_id)
    if not found:
        raise HTTPException(status_code=404, detail="Test not found")


# ── Question sets ─────────────────────────────────────────────────────────────

@router.post("/tests/{test_id}/question-sets")
async def regenerate_question_set(test_id: str, request: Request, body: RegenerateIn = RegenerateIn()):
    _validate_uuid(test_id, "test_id")

    pool = request.app.state.pool
    embed_model = request.app.state.embed_model

    test = await _fetch_test_row(pool, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    counts = await _fetch_latest_qs_counts(pool, test_id)
    if counts is None:
        raise HTTPException(status_code=404, detail="No question sets found for this test")
    default_mcq, default_frq = counts
    mcq_count = body.mcq_count if body.mcq_count is not None else default_mcq
    frq_count = body.frq_count if body.frq_count is not None else default_frq

    all_objectives: list[str] = list(test.get("all_objectives") or [])
    already_tested = await get_tested_objectives(pool, test_id)

    question_set = await create_question_set(pool, test_id, mcq_count, frq_count)
    question_set_id = question_set["id"]
    logger.info("Regenerating: test=%s new question_set=%s", test_id, question_set_id)

    async def _run(on_progress):
        qs_with_questions = await run_test_generation(
            pool=pool,
            question_set_id=question_set_id,
            test_id=test_id,
            course_id=test["course_id"],
            document_ids=test["source_document_ids"],
            mcq_count=mcq_count,
            frq_count=frq_count,
            purpose=test["purpose"],
            all_objectives=all_objectives if all_objectives else None,
            already_tested=already_tested,
            openrouter_key=settings.openrouter_key,
            model=settings.openrouter_model,
            context_limit=settings.model_context_limit,
            embed_model=embed_model,
            on_progress=on_progress,
        )
        questions = qs_with_questions.get("questions", [])
        logger.info("Regeneration done: test=%s qs=%s questions=%d", test_id, question_set_id, len(questions))
        return {"test_id": test_id, "question_set": question_set, "questions": questions}

    return _streaming_response(_run)


@router.get("/question-sets/{question_set_id}")
async def get_question_set(question_set_id: str, request: Request):
    _validate_uuid(question_set_id, "question_set_id")
    qs = await get_question_set_with_questions(request.app.state.pool, question_set_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")
    return qs


@router.delete("/question-sets/{question_set_id}", status_code=204)
async def remove_question_set(question_set_id: str, request: Request):
    _validate_uuid(question_set_id, "question_set_id")
    found = await delete_question_set(request.app.state.pool, question_set_id)
    if not found:
        raise HTTPException(status_code=404, detail="Question set not found")


# ── Attempts ──────────────────────────────────────────────────────────────────

@router.post("/question-sets/{question_set_id}/attempts")
async def submit_and_grade_attempt(question_set_id: str, body: SubmitAttemptIn, request: Request):
    _validate_uuid(question_set_id, "question_set_id")

    pool = request.app.state.pool

    qs = await get_question_set_with_questions(pool, question_set_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Question set not found")

    attempt = await create_attempt(pool, question_set_id)
    attempt_id = attempt["id"]
    raw_answers = [a.model_dump() for a in body.answers]

    async def _run(on_progress):
        result = await run_grading(
            pool=pool,
            attempt_id=attempt_id,
            question_set_with_questions=qs,
            raw_answers=raw_answers,
            question_order=body.question_order,
            option_orders=body.option_orders,
            openrouter_key=settings.openrouter_key,
            model=settings.openrouter_model,
            on_progress=on_progress,
        )
        logger.info(
            "Grading done: attempt=%s score=%.1f/%.1f",
            attempt_id, result.get("score") or 0, result.get("max_score") or 0,
        )
        return result

    return _streaming_response(_run)


@router.get("/question-sets/{question_set_id}/attempts")
async def list_attempts(question_set_id: str, request: Request):
    _validate_uuid(question_set_id, "question_set_id")
    return await list_attempts_by_question_set(request.app.state.pool, question_set_id)


@router.get("/question-sets/{question_set_id}/attempts/{attempt_id}")
async def get_attempt_detail(question_set_id: str, attempt_id: str, request: Request):
    _validate_uuid(question_set_id, "question_set_id")
    _validate_uuid(attempt_id, "attempt_id")
    attempt = await get_attempt(request.app.state.pool, attempt_id)
    if not attempt or attempt.get("question_set_id") != question_set_id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return attempt

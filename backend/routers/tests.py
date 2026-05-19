from __future__ import annotations

import asyncio
import json as json_lib
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.config import settings
from db.tests import create_test, delete_test, get_test_with_questions, list_tests_by_course
from schemas.tests import GenerateTestIn
from services.test_generation import run_test_generation

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


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
        mcq_count=body.mcq_count,
        frq_count=body.frq_count,
        purpose=body.purpose,
    )
    test_id = test["id"]
    logger.info("Created test row: id=%s course=%s", test_id, course_id)

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(event: dict) -> None:
            await queue.put(("progress", event))

        async def run() -> None:
            try:
                result = await run_test_generation(
                    pool=pool,
                    test_id=test_id,
                    course_id=course_id,
                    document_ids=body.document_ids,
                    mcq_count=body.mcq_count,
                    frq_count=body.frq_count,
                    purpose=body.purpose,
                    openrouter_key=settings.openrouter_key,
                    model=settings.openrouter_model,
                    context_limit=settings.model_context_limit,
                    embed_model=embed_model,
                    on_progress=on_progress,
                )
                logger.info("Test generation complete: id=%s questions=%d", test_id, len(result.get("questions", [])))
                await queue.put(("done", result))
            except Exception as exc:
                logger.exception("Test generation failed for test=%s", test_id)
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
            await task

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/courses/{course_id}/tests")
async def list_course_tests(course_id: str, request: Request):
    _validate_uuid(course_id, "course_id")
    return await list_tests_by_course(request.app.state.pool, course_id)


@router.get("/tests/{test_id}")
async def get_test(test_id: str, request: Request):
    _validate_uuid(test_id, "test_id")
    test = await get_test_with_questions(request.app.state.pool, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test


@router.delete("/tests/{test_id}", status_code=204)
async def remove_test(test_id: str, request: Request):
    _validate_uuid(test_id, "test_id")
    found = await delete_test(request.app.state.pool, test_id)
    if not found:
        raise HTTPException(status_code=404, detail="Test not found")

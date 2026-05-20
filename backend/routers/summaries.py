import asyncio
import json as json_lib
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.config import settings
from db.chunks import get_parent_chunks_by_child_ids, search_chunks_by_embedding
from db.summaries import (
    create_summary,
    create_summary_version,
    delete_summary,
    get_summary,
    get_summary_version_content,
    list_summaries_by_course,
    list_summary_versions,
)
from schemas.summaries import EditSummaryIn, SummarizeIn
from services.summarization import SummaryOptions, run_content_edit, run_structure_edit, run_summarization

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


@router.post("/courses/{course_id}/summaries")
async def create_course_summary(course_id: str, body: SummarizeIn, request: Request):
    _validate_uuid(course_id, "course_id")
    if not body.document_ids:
        raise HTTPException(status_code=422, detail="document_ids must not be empty")
    for doc_id in body.document_ids:
        _validate_uuid(doc_id, "document_id")

    pool = request.app.state.pool

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_progress(event: dict) -> None:
            await queue.put(("progress", event))

        async def run() -> None:
            try:
                logger.info("Starting summarization for course=%s docs=%s", course_id, body.document_ids)
                options = SummaryOptions(**body.options.model_dump())
                result = await run_summarization(
                    pool=pool,
                    document_ids=body.document_ids,
                    openrouter_key=settings.openrouter_key,
                    model=settings.openrouter_model,
                    context_limit=settings.model_context_limit,
                    options=options,
                    on_progress=on_progress,
                )
                summary = await create_summary(
                    pool,
                    course_id=course_id,
                    title=result["title"],
                    content=result["content"],
                    source_document_ids=body.document_ids,
                )
                logger.info("Summary created: id=%s title=%r", summary["id"], summary["title"])
                await queue.put(("done", summary))
            except Exception as exc:
                logger.exception("Summarization failed")
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
                pass  # task continues as a background task if client disconnected

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/courses/{course_id}/summaries")
async def list_course_summaries(course_id: str, request: Request):
    _validate_uuid(course_id, "course_id")
    summaries = await list_summaries_by_course(request.app.state.pool, course_id)
    return summaries


@router.patch("/summaries/{summary_id}")
async def edit_summary(summary_id: str, body: EditSummaryIn, request: Request):
    _validate_uuid(summary_id, "summary_id")

    pool = request.app.state.pool
    existing = await get_summary(pool, summary_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Summary not found")

    if body.edit_type == "structure":
        new_content = await run_structure_edit(
            existing_content=existing["content"],
            instruction=body.instruction,
            openrouter_key=settings.openrouter_key,
            model=settings.openrouter_model,
        )
        chunk_ids: list[str] = []
    else:
        embed_model = request.app.state.embed_model
        embedding = await asyncio.to_thread(embed_model.get_text_embedding, body.instruction)
        child_chunks = await search_chunks_by_embedding(
            pool, embedding, course_id=existing["course_id"], limit=10
        )
        child_ids = [c["id"] for c in child_chunks]
        parent_chunks = await get_parent_chunks_by_child_ids(pool, child_ids)
        new_content = await run_content_edit(
            existing_content=existing["content"],
            instruction=body.instruction,
            parent_chunks=parent_chunks,
            openrouter_key=settings.openrouter_key,
            model=settings.openrouter_model,
        )
        chunk_ids = child_ids

    await create_summary_version(
        pool, summary_id, new_content,
        edit_type=body.edit_type,
        source_chunk_ids=chunk_ids,
    )
    updated = await get_summary(pool, summary_id)
    logger.info(
        "Summary edited: id=%s type=%s version=%d",
        summary_id, body.edit_type, updated["current_version_number"],
    )
    return updated


@router.get("/summaries/{summary_id}/versions")
async def get_summary_versions(summary_id: str, request: Request):
    _validate_uuid(summary_id, "summary_id")
    versions = await list_summary_versions(request.app.state.pool, summary_id)
    if not versions:
        raise HTTPException(status_code=404, detail="Summary not found")
    return versions


@router.get("/summaries/{summary_id}/versions/{version_id}")
async def get_version_content(summary_id: str, version_id: str, request: Request):
    _validate_uuid(summary_id, "summary_id")
    _validate_uuid(version_id, "version_id")
    version = await get_summary_version_content(request.app.state.pool, summary_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.delete("/summaries/{summary_id}", status_code=204)
async def remove_summary(summary_id: str, request: Request):
    _validate_uuid(summary_id, "summary_id")
    pool = request.app.state.pool
    found = await delete_summary(pool, summary_id)
    if not found:
        raise HTTPException(status_code=404, detail="Summary not found")

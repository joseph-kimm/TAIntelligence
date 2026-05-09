import logging
import uuid

from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from db.documents import create_document, delete_document, update_document_token_count
from db.sections import get_or_create_summaries_section
from db.summaries import (
    create_summary,
    create_summary_version,
    delete_summary,
    get_summary,
    get_summary_version_content,
    list_summaries_by_course,
    list_summary_versions,
)
from schemas.summaries import RefineIn, SummarizeIn
from services.summarization import SummaryOptions, run_refinement, run_summarization

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


@router.post("/courses/{course_id}/summaries", status_code=201)
async def create_course_summary(course_id: str, body: SummarizeIn, request: Request):
    _validate_uuid(course_id, "course_id")
    if not body.document_ids:
        raise HTTPException(status_code=422, detail="document_ids must not be empty")
    for doc_id in body.document_ids:
        _validate_uuid(doc_id, "document_id")

    pool = request.app.state.pool

    logger.info("Starting summarization for course=%s docs=%s", course_id, body.document_ids)
    options = SummaryOptions(**body.options.model_dump())
    result = await run_summarization(
        pool=pool,
        document_ids=body.document_ids,
        openrouter_key=settings.openrouter_key,
        model=settings.openrouter_model,
        context_limit=settings.model_context_limit,
        options=options,
    )

    section_id = await get_or_create_summaries_section(pool, course_id)

    import tiktoken
    token_count = len(tiktoken.get_encoding("cl100k_base").encode(result["content"]))

    doc = await create_document(
        pool,
        section_id=section_id,
        title=result["title"],
        source_type="summary",
        source_ref=None,
    )
    await update_document_token_count(pool, doc["id"], token_count)

    summary = await create_summary(
        pool,
        course_id=course_id,
        document_id=doc["id"],
        title=result["title"],
        content=result["content"],
        source_document_ids=body.document_ids,
    )
    logger.info("Summary created: id=%s title=%r", summary["id"], summary["title"])
    return summary


@router.get("/courses/{course_id}/summaries")
async def list_course_summaries(course_id: str, request: Request):
    _validate_uuid(course_id, "course_id")
    summaries = await list_summaries_by_course(request.app.state.pool, course_id)
    return summaries


@router.patch("/summaries/{summary_id}")
async def refine_summary(summary_id: str, body: RefineIn, request: Request):
    _validate_uuid(summary_id, "summary_id")
    if not body.instruction.strip():
        raise HTTPException(status_code=422, detail="instruction must not be empty")

    pool = request.app.state.pool
    existing = await get_summary(pool, summary_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Summary not found")

    result = await run_refinement(
        existing_content=existing["content"],
        instruction=body.instruction.strip(),
        openrouter_key=settings.openrouter_key,
        model=settings.openrouter_model,
    )
    await create_summary_version(pool, summary_id, result["content"])
    updated = await get_summary(pool, summary_id)
    logger.info("Summary refined: id=%s version=%d", summary_id, updated["current_version_number"])
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
    document_id = await delete_summary(pool, summary_id)
    if document_id is None:
        raise HTTPException(status_code=404, detail="Summary not found")
    if document_id:
        await delete_document(pool, document_id)

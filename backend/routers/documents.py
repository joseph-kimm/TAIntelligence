import asyncio
import logging
import uuid

from fastapi import APIRouter, Form, HTTPException, Request

from core.r2 import delete_from_r2, fetch_from_r2, generate_presigned_put_url
from db.documents import (
    create_document,
    delete_document,
    get_document,
    get_document_ingestion_status,
    mark_document_ingestion_failed,
    move_document,
    rename_document,
    set_document_source_ref,
)
from schemas.courses import DocumentOut, MoveDocumentIn, RenameIn, ReserveDocumentIn, ReserveDocumentOut
from services.ingestion import ingest_document

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


@router.post("/documents/reserve", response_model=ReserveDocumentOut, status_code=201)
async def reserve_document(body: ReserveDocumentIn, request: Request):
    """
    Step 1 of direct browser upload.
    Creates a placeholder DB record (gets UUID from PostgreSQL), generates a presigned
    R2 PUT URL using that UUID as the key, and returns both to the browser.
    """
    _validate_uuid(body.section_id, "section_id")
    if body.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{body.content_type}'. Allowed: PDF, DOCX, TXT.",
        )

    row = await create_document(
        request.app.state.pool,
        body.section_id,
        body.title.strip(),
        "file",
        None,
    )
    doc_id = row["id"]
    r2_key = f"documents/{doc_id}"
    await set_document_source_ref(request.app.state.pool, doc_id, r2_key)
    row["source_ref"] = r2_key

    upload_url = await asyncio.to_thread(generate_presigned_put_url, r2_key, body.content_type)
    return ReserveDocumentOut(document=DocumentOut(**row), upload_url=upload_url)


@router.post("/documents/{document_id}/ingest", status_code=202)
async def trigger_ingest(document_id: str, request: Request):
    """
    Step 3 of direct browser upload (called after the browser has PUT the file to R2).
    Reads the file from R2 server-to-server and fires ingestion as a detached asyncio
    task that survives client disconnect.
    """
    _validate_uuid(document_id, "document_id")
    doc = await get_document(request.app.state.pool, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.get("source_ref"):
        raise HTTPException(status_code=409, detail="Document has no R2 key")

    pool = request.app.state.pool
    embed_model = request.app.state.embed_model
    r2_key = doc["source_ref"]
    doc_title = doc["title"]

    async def _fetch_and_ingest():
        try:
            file_bytes, mime_type = await asyncio.to_thread(fetch_from_r2, r2_key)
        except Exception:
            logger.exception("[%s] Failed to fetch file from R2", document_id)
            await mark_document_ingestion_failed(pool, document_id)
            return
        await ingest_document(pool, embed_model, document_id, file_bytes, mime_type, doc_title)

    asyncio.create_task(_fetch_and_ingest())
    return {"status": "ingestion_started"}


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def add_document(
    request: Request,
    section_id: str = Form(...),
    title: str = Form(..., min_length=1, max_length=200),
    source_type: str = Form(...),
    source_ref: str | None = Form(None),
):
    """
    Create a website document (source_type='website').
    File uploads use POST /documents/reserve + PUT to R2 + POST /documents/{id}/ingest instead.
    """
    _validate_uuid(section_id, "section_id")

    if source_type != "website":
        raise HTTPException(status_code=422, detail="This endpoint only accepts source_type='website'. Use /documents/reserve for file uploads.")
    if not source_ref:
        raise HTTPException(status_code=422, detail="source_ref (URL) is required for source_type='website'")

    row = await create_document(
        request.app.state.pool,
        section_id,
        title.strip(),
        source_type,
        source_ref,
    )
    return DocumentOut(**row)


@router.get("/documents/{document_id}/ingestion-status")
async def get_ingestion_status(document_id: str, request: Request):
    _validate_uuid(document_id, "document_id")
    status = await get_document_ingestion_status(request.app.state.pool, document_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": status}


@router.patch("/documents/{document_id}")
async def update_document_name(document_id: str, body: RenameIn, request: Request):
    """Rename a document."""
    _validate_uuid(document_id, "document_id")
    row = await rename_document(request.app.state.pool, document_id, body.title.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.patch("/documents/{document_id}/move")
async def move_document_to_section(document_id: str, body: MoveDocumentIn, request: Request):
    """Move a document to a different section."""
    _validate_uuid(document_id, "document_id")
    _validate_uuid(body.section_id, "section_id")
    row = await move_document(request.app.state.pool, document_id, body.section_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.delete("/documents/{document_id}", status_code=204)
async def remove_document(document_id: str, request: Request):
    """Delete a document and its R2 object (if it was a file upload)."""
    _validate_uuid(document_id, "document_id")
    doc = await get_document(request.app.state.pool, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await delete_document(request.app.state.pool, document_id)
    if doc["source_type"] == "file" and doc["source_ref"]:
        await asyncio.to_thread(delete_from_r2, doc["source_ref"])

import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile

from core.r2 import delete_from_r2, upload_to_r2
from db.documents import (
    create_document,
    delete_document,
    get_document,
    rename_document,
    set_document_source_ref,
)
from schemas.courses import DocumentOut, RenameIn
from services.ingestion import ingest_document

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

router = APIRouter()


def _validate_uuid(value: str, field: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: must be a valid UUID.")


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def add_document(
    request: Request,
    background_tasks: BackgroundTasks,
    section_id: str = Form(...),
    title: str = Form(..., min_length=1, max_length=200),
    source_type: str = Form(...),
    source_ref: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    """
    Create a document record. Accepts two source types:
    - 'file': upload the file to R2; source_ref becomes the R2 object key.
              Ingestion (chunking + embedding) runs as a background task.
    - 'website': store the URL as-is; pass the URL in source_ref.
    """
    _validate_uuid(section_id, "section_id")

    if source_type not in ("file", "website"):
        raise HTTPException(status_code=422, detail="source_type must be 'file' or 'website'")

    file_bytes: bytes | None = None

    if source_type == "file":
        if file is None:
            raise HTTPException(status_code=422, detail="file is required for source_type='file'")
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported file type '{file.content_type}'. Allowed: PDF, DOCX, TXT.",
            )
        file_bytes = await file.read()
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    elif source_type == "website":
        if not source_ref:
            raise HTTPException(status_code=422, detail="source_ref (URL) is required for source_type='website'")

    # Insert DB record first so PostgreSQL generates the UUID.
    row = await create_document(
        request.app.state.pool,
        section_id,
        title.strip(),
        source_type,
        source_ref,  # None for files until R2 upload completes
    )

    if source_type == "file":
        doc_id = row["id"]
        r2_key = f"documents/{doc_id}"
        await asyncio.to_thread(upload_to_r2, file_bytes, r2_key, file.content_type)
        await set_document_source_ref(request.app.state.pool, doc_id, r2_key)
        row["source_ref"] = r2_key

        # Kick off ingestion in the background — the response returns immediately
        # while the server extracts text, chunks, embeds, and stores the vectors.
        background_tasks.add_task(
            ingest_document,
            request.app.state.pool,
            request.app.state.embed_model,
            doc_id,
            file_bytes,
            file.content_type,
        )

    return DocumentOut(**row)


@router.patch("/documents/{document_id}")
async def update_document_name(document_id: str, body: RenameIn, request: Request):
    """Rename a document."""
    _validate_uuid(document_id, "document_id")
    row = await rename_document(request.app.state.pool, document_id, body.title.strip())
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

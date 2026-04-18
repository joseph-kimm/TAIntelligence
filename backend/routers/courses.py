import asyncio

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from core.r2 import delete_from_r2, upload_to_r2
from db.courses import (
    create_course,
    create_document,
    create_section,
    delete_course,
    delete_document,
    delete_section,
    get_course,
    get_document,
    get_r2_keys_for_course,
    get_r2_keys_for_section,
    list_courses,
    list_sections_with_documents,
    rename_course,
    rename_document,
    rename_section,
    set_document_source_ref,
)
from schemas.courses import CourseIn, CourseOut, DocumentOut, RenameIn, SectionIn, SectionOut

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

# All routes in this file are prefixed with /api (set in main.py)
router = APIRouter()


@router.get(
    "/courses",
    response_model=list[CourseOut],
    response_model_by_alias=True,  # sends camelCase (updatedAt) not snake_case
)
async def get_courses(request: Request):
    """Return all courses ordered by most recently updated."""
    rows = await list_courses(request.app.state.pool)
    return [CourseOut(**row) for row in rows]


@router.post(
    "/courses",
    response_model=CourseOut,
    response_model_by_alias=True,
    status_code=201,
)
async def add_course(body: CourseIn, request: Request):
    """Create a new course and return it."""
    row = await create_course(request.app.state.pool, body.title.strip())
    return CourseOut(**row)


@router.get(
    "/courses/{course_id}",
    response_model=CourseOut,
    response_model_by_alias=True,
)
async def get_course_by_id(course_id: str, request: Request):
    """Return a single course. Returns 404 if the ID doesn't exist."""
    row = await get_course(request.app.state.pool, course_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseOut(**row)


@router.patch(
    "/courses/{course_id}",
    response_model=CourseOut,
    response_model_by_alias=True,
)
async def update_course_name(course_id: str, body: RenameIn, request: Request):
    """Rename a course."""
    row = await rename_course(request.app.state.pool, course_id, body.title.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseOut(**row)

@router.delete("/courses/{course_id}", status_code=204)
async def remove_course(course_id: str, request: Request):
    """Delete a course and all its R2 files."""
    keys = await get_r2_keys_for_course(request.app.state.pool, course_id)
    deleted = await delete_course(request.app.state.pool, course_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    await asyncio.gather(*[asyncio.to_thread(delete_from_r2, key) for key in keys])


@router.get(
    "/courses/{course_id}/sections",
    response_model=list[SectionOut],
)
async def get_course_sections(course_id: str, request: Request):
    """
    Return all sections for a course, each with its documents nested inside.
    Returns an empty list if the course has no sections yet.
    """
    rows = await list_sections_with_documents(request.app.state.pool, course_id)
    return [SectionOut(**row) for row in rows]


@router.patch("/sections/{section_id}")
async def update_section_name(section_id: str, body: RenameIn, request: Request):
    """Rename a section."""
    row = await rename_section(request.app.state.pool, section_id, body.title.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Section not found")
    return row


@router.delete("/sections/{section_id}", status_code=204)
async def remove_section(section_id: str, request: Request):
    """Delete a section and all its R2 files."""
    keys = await get_r2_keys_for_section(request.app.state.pool, section_id)
    deleted = await delete_section(request.app.state.pool, section_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Section not found")
    await asyncio.gather(*[asyncio.to_thread(delete_from_r2, key) for key in keys])


@router.patch("/documents/{document_id}")
async def update_document_name(document_id: str, body: RenameIn, request: Request):
    """Rename a document."""
    row = await rename_document(request.app.state.pool, document_id, body.title.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.delete("/documents/{document_id}", status_code=204)
async def remove_document(document_id: str, request: Request):
    """Delete a document and its R2 object (if it was a file upload)."""
    doc = await get_document(request.app.state.pool, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    await delete_document(request.app.state.pool, document_id)
    if doc["source_type"] == "file" and doc["source_ref"]:
        await asyncio.to_thread(delete_from_r2, doc["source_ref"])


@router.post("/sections", response_model=SectionOut, status_code=201)
async def add_section(body: SectionIn, request: Request):
    """Create a new section at the end of a course."""
    row = await create_section(request.app.state.pool, body.course_id, body.title.strip())
    return SectionOut(id=row["id"], title=row["title"], documents=[])


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def add_document(
    request: Request,
    section_id: str = Form(...),
    title: str = Form(...),
    source_type: str = Form(...),
    source_ref: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    """
    Create a document record. Accepts two source types:
    - 'file': upload the file to R2; source_ref becomes the R2 object key.
    - 'website': store the URL as-is; pass the URL in source_ref.
    """
    if source_type not in ("file", "website"):
        raise HTTPException(status_code=422, detail="source_type must be 'file' or 'website'")

    if source_type == "file":
        if file is None:
            raise HTTPException(status_code=422, detail="file is required for source_type='file'")
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported file type '{file.content_type}'. Allowed: PDF, DOCX, TXT.",
            )
        file_bytes = await file.read()

    elif source_type == "website":
        if not source_ref:
            raise HTTPException(status_code=422, detail="source_ref (URL) is required for source_type='website'")

    # Insert the record first so PostgreSQL generates the UUID.
    row = await create_document(
        request.app.state.pool,
        section_id,
        title.strip(),
        source_type,
        source_ref,  # None for files until R2 upload completes
    )

    # For files: upload to R2 using the DB-generated UUID as the key, then store it.
    if source_type == "file":
        doc_id = row["id"]
        r2_key = f"documents/{doc_id}"
        await asyncio.to_thread(upload_to_r2, file_bytes, r2_key, file.content_type)
        await set_document_source_ref(request.app.state.pool, doc_id, r2_key)
        row["source_ref"] = r2_key

    return DocumentOut(**row)

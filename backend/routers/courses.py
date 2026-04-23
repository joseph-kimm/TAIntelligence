import asyncio

from fastapi import APIRouter, HTTPException, Request

from core.r2 import delete_from_r2
from db.courses import (
    create_course,
    delete_course,
    get_course,
    get_r2_keys_for_course,
    list_courses,
    rename_course,
)
from db.sections import list_sections_with_documents
from schemas.courses import CourseIn, CourseOut, RenameIn, SectionOut

router = APIRouter()


@router.get("/courses", response_model=list[CourseOut], response_model_by_alias=True)
async def get_courses(request: Request):
    """Return all courses ordered by most recently updated."""
    rows = await list_courses(request.app.state.pool)
    return [CourseOut(**row) for row in rows]


@router.post("/courses", response_model=CourseOut, response_model_by_alias=True, status_code=201)
async def add_course(body: CourseIn, request: Request):
    """Create a new course and return it."""
    row = await create_course(request.app.state.pool, body.title.strip())
    return CourseOut(**row)


@router.get("/courses/{course_id}", response_model=CourseOut, response_model_by_alias=True)
async def get_course_by_id(course_id: str, request: Request):
    """Return a single course. Returns 404 if the ID doesn't exist."""
    row = await get_course(request.app.state.pool, course_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseOut(**row)


@router.patch("/courses/{course_id}", response_model=CourseOut, response_model_by_alias=True)
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


@router.get("/courses/{course_id}/sections", response_model=list[SectionOut])
async def get_course_sections(course_id: str, request: Request):
    """Return all sections for a course, each with its documents nested inside."""
    rows = await list_sections_with_documents(request.app.state.pool, course_id)
    return [SectionOut(**row) for row in rows]

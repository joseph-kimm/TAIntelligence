from fastapi import APIRouter, HTTPException, Request

from db.courses import get_course, list_courses, list_sections_with_documents
from schemas.courses import CourseOut, SectionOut

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

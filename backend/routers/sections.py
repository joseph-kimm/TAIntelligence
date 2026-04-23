import asyncio

from fastapi import APIRouter, HTTPException, Request

from core.r2 import delete_from_r2
from db.sections import (
    create_section,
    delete_section,
    get_r2_keys_for_section,
    rename_section,
)
from schemas.courses import RenameIn, SectionIn, SectionOut

router = APIRouter()


@router.post("/sections", response_model=SectionOut, status_code=201)
async def add_section(body: SectionIn, request: Request):
    """Create a new section at the end of a course."""
    row = await create_section(request.app.state.pool, body.course_id, body.title.strip())
    return SectionOut(id=row["id"], title=row["title"], documents=[])


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

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_serializer
from pydantic.alias_generators import to_camel


class CourseIn(BaseModel):
    """Request body for creating a course."""
    title: str = Field(..., min_length=1, max_length=200)


class RenameIn(BaseModel):
    """Request body for rename endpoints."""
    title: str = Field(..., min_length=1, max_length=200)


class SectionIn(BaseModel):
    """Request body for creating a section."""
    course_id: str
    title: str = Field(..., min_length=1, max_length=200)


class DocumentOut(BaseModel):
    """A single document inside a section."""
    id: str
    title: str
    source_type: str | None = None
    source_ref: str | None = None


class SectionOut(BaseModel):
    """A section with its documents nested inside."""
    id: str
    title: str
    documents: list[DocumentOut]


class CourseOut(BaseModel):
    """
    A course as returned by the API.

    alias_generator=to_camel converts field names to camelCase in the JSON
    response — so `updated_at` becomes `updatedAt` for the frontend.
    populate_by_name=True lets us construct this model using snake_case
    names internally when passing data from the DB query.
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: str
    title: str
    updated_at: datetime

    @field_serializer("updated_at")
    def format_updated_at(self, value: datetime) -> str:
        """Convert the raw datetime to a readable string for the frontend."""
        return value.strftime("%b %d, %Y")

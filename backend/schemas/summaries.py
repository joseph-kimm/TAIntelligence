from typing import Literal

from pydantic import BaseModel, field_validator


class SummaryOptionsIn(BaseModel):
    detail_level: int = 0
    length_auto: bool = True
    length_minutes: int = 5
    audience: int = 0
    style: str | None = None
    tone: str | None = None
    focus_emphasis: list[str] = []


class SummarizeIn(BaseModel):
    document_ids: list[str]
    options: SummaryOptionsIn = SummaryOptionsIn()


class RefineIn(BaseModel):
    instruction: str


class EditSummaryIn(BaseModel):
    instruction: str
    edit_type: Literal["structure", "content"] = "structure"

    @field_validator("instruction")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("instruction must not be empty")
        return v.strip()

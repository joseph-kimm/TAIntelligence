from typing import Literal

from pydantic import BaseModel, field_validator


class GenerateTestIn(BaseModel):
    document_ids: list[str]
    mcq_count: int = 10
    frq_count: int = 3
    purpose: Literal["quick_review", "exam_prep", "deep_application"] = "quick_review"
    title: str

    @field_validator("mcq_count")
    @classmethod
    def valid_mcq(cls, v: int) -> int:
        if not (0 <= v <= 20):
            raise ValueError("mcq_count must be between 0 and 20")
        return v

    @field_validator("frq_count")
    @classmethod
    def valid_frq(cls, v: int) -> int:
        if not (0 <= v <= 10):
            raise ValueError("frq_count must be between 0 and 10")
        return v

    @field_validator("title")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()


class RawAnswerIn(BaseModel):
    question_id: str
    selected_option_id: str | None = None
    response_text: str | None = None


class SubmitAttemptIn(BaseModel):
    answers: list[RawAnswerIn] = []
    question_order: list[str] = []
    option_orders: dict[str, list[str]] = {}

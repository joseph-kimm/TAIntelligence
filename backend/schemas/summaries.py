from pydantic import BaseModel


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

import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MessageIn(_CamelModel):
    content: str
    document_ids: list[str] = []


class MessageOut(_CamelModel):
    id: str
    chat_id: str
    role: str
    content: str
    chunk_ids: list[str]
    created_at: datetime


class ChatOut(_CamelModel):
    id: str
    course_id: str
    created_at: datetime
    messages: list[MessageOut]

    @field_validator("messages", mode="before")
    @classmethod
    def parse_messages(cls, v: object) -> list[dict]:
        if isinstance(v, str):
            return json.loads(v)
        return v  # type: ignore[return-value]


class SendMessageOut(_CamelModel):
    user_message: MessageOut
    assistant_message: MessageOut

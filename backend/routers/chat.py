import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request, status

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse

from core.config import settings
from db.chats import (
    add_message,
    create_chat,
    delete_chat,
    delete_messages_from,
    get_chat_with_messages,
    list_chats_with_messages,
)
from db.chunks import search_chunks_by_embedding
from schemas.chat import ChatOut, MessageIn, MessageOut
from services.llm import build_system_prompt, stream_llm_response

router = APIRouter()


def _log_retrieved_chunks(chunks: list[dict]) -> None:
    logger.info("Retrieved %d chunks:", len(chunks))
    for i, chunk in enumerate(chunks, 1):
        first_10 = " ".join(chunk["text"].split()[:10])
        title = chunk.get("document_title", "unknown")
        score = chunk.get("similarity", 0)
        logger.info("  [%d] (score=%.4f) [%s] %s…", i, score, title, first_10)


def _make_stream(
    pool,
    chat_id: str,
    course_id: str,
    user_msg: dict,
    chunks: list[dict],
    conversation: list[dict],
) -> StreamingResponse:
    """Build a StreamingResponse that emits SSE events for a chat turn.

    Events emitted (newline-delimited JSON after 'data: '):
      {"type": "user_message", "message": {...}}   — saved user message
      {"type": "delta", "content": "..."}          — streamed LLM token
      {"type": "done", "message": {...}}            — saved assistant message
      {"type": "error", "message": "..."}          — on LLM failure
    """
    system_prompt = build_system_prompt(chunks)

    async def event_generator():
        user_msg_data = MessageOut.model_validate(user_msg).model_dump(by_alias=True, mode="json")
        yield f"data: {json.dumps({'type': 'user_message', 'message': user_msg_data})}\n\n"

        collected: list[str] = []
        try:
            async for token in stream_llm_response(
                openrouter_key=settings.openrouter_key,
                model=settings.openrouter_model,
                messages=conversation,
                system_prompt=system_prompt,
            ):
                collected.append(token)
                yield f"data: {json.dumps({'type': 'delta', 'content': token})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            return

        assistant_content = "".join(collected)
        chunk_ids = [c["id"] for c in chunks]
        assistant_msg = await add_message(pool, chat_id, "assistant", assistant_content, chunk_ids)
        assistant_msg_data = MessageOut.model_validate(assistant_msg).model_dump(by_alias=True, mode="json")
        yield f"data: {json.dumps({'type': 'done', 'message': assistant_msg_data})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/courses/{course_id}/chats", response_model=list[ChatOut])
async def get_chats(course_id: str, request: Request):
    pool = request.app.state.pool
    rows = await list_chats_with_messages(pool, course_id)
    return [ChatOut.model_validate(row) for row in rows]


@router.post(
    "/courses/{course_id}/chats",
    response_model=ChatOut,
    status_code=status.HTTP_201_CREATED,
)
async def new_chat(course_id: str, request: Request):
    pool = request.app.state.pool
    row = await create_chat(pool, course_id)
    return ChatOut.model_validate({**row, "messages": []})


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chat(chat_id: str, request: Request):
    pool = request.app.state.pool
    deleted = await delete_chat(pool, chat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat not found")


@router.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, body: MessageIn, request: Request):
    pool = request.app.state.pool
    embed_model = request.app.state.embed_model

    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    chat = await get_chat_with_messages(pool, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    user_msg = await add_message(pool, chat_id, "user", content)
    embedding = await asyncio.to_thread(embed_model.get_text_embedding, content)
    chunks = await search_chunks_by_embedding(
        pool, embedding, chat["course_id"], document_ids=body.document_ids or None
    )

    _log_retrieved_chunks(chunks)
    conversation = [*chat["messages"], {"role": "user", "content": content}]
    return _make_stream(pool, chat_id, chat["course_id"], user_msg, chunks, conversation)


@router.patch("/chats/{chat_id}/messages/{message_id}")
async def edit_message(chat_id: str, message_id: str, body: MessageIn, request: Request):
    pool = request.app.state.pool
    embed_model = request.app.state.embed_model

    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    await delete_messages_from(pool, chat_id, message_id)

    chat = await get_chat_with_messages(pool, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    user_msg = await add_message(pool, chat_id, "user", content)
    embedding = await asyncio.to_thread(embed_model.get_text_embedding, content)
    chunks = await search_chunks_by_embedding(
        pool, embedding, chat["course_id"], document_ids=body.document_ids or None
    )

    _log_retrieved_chunks(chunks)
    conversation = [*chat["messages"], {"role": "user", "content": content}]
    return _make_stream(pool, chat_id, chat["course_id"], user_msg, chunks, conversation)

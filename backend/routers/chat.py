import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, RateLimitError

logger = logging.getLogger(__name__)

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
from services.llm import build_system_prompt, collect_llm_response, replay_as_stream
from services.response_parser import parse_and_validate

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

        try:
            raw = await collect_llm_response(
                openrouter_key=settings.openrouter_key,
                model=settings.openrouter_model,
                messages=conversation,
                system_prompt=system_prompt,
            )
        except AuthenticationError:
            logger.error("OpenRouter authentication failed — check OPENROUTER_KEY")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid API key. Check your OpenRouter credentials.'})}\n\n"
            return
        except RateLimitError:
            logger.warning("OpenRouter rate limit exceeded")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Rate limit exceeded. Please wait a moment and try again.'})}\n\n"
            return
        except APITimeoutError:
            logger.warning("OpenRouter request timed out")
            yield f"data: {json.dumps({'type': 'error', 'message': 'The AI provider timed out. Please try again.'})}\n\n"
            return
        except APIConnectionError:
            logger.warning("Could not connect to OpenRouter")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Could not reach the AI provider. Check your internet connection.'})}\n\n"
            return
        except APIStatusError as exc:
            logger.error("OpenRouter returned HTTP %d", exc.status_code)
            if exc.status_code == 404:
                msg = f"Model '{settings.openrouter_model}' not found or unavailable."
            elif exc.status_code == 402:
                msg = "Insufficient credits on your OpenRouter account."
            elif exc.status_code >= 500:
                msg = "The AI provider is experiencing issues. Please try again later."
            else:
                msg = f"The AI provider returned an error (HTTP {exc.status_code})."
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
            return
        except Exception:
            logger.exception("Unexpected error during LLM collect")
            yield f"data: {json.dumps({'type': 'error', 'message': 'An unexpected error occurred. Please try again.'})}\n\n"
            return

        _RAW_RESPONSE_PATH = Path(__file__).parent.parent / "llm_raw_response.txt"
        with _RAW_RESPONSE_PATH.open("a") as f:
            f.write("\n\n--- response ---\n\n")
            f.write(raw)

        parsed = parse_and_validate(raw, chunks)

        async for token in replay_as_stream(parsed.content):
            yield f"data: {json.dumps({'type': 'delta', 'content': token})}\n\n"

        chunk_ids = [c.id for c in parsed.cited_chunks]
        assistant_msg = await add_message(pool, chat_id, "assistant", parsed.content, chunk_ids)
        assistant_msg_data = MessageOut.model_validate(assistant_msg).model_dump(by_alias=True, mode="json")
        citations_data = [
            {"id": c.id, "text": c.text, "documentTitle": c.document_title}
            for c in parsed.cited_chunks
        ]
        yield f"data: {json.dumps({'type': 'done', 'message': assistant_msg_data, 'citations': citations_data})}\n\n"

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

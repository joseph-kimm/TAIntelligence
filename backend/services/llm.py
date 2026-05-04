from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


def build_system_prompt(chunks: list[dict]) -> str:
    """Format retrieved chunks as a system prompt for the LLM.

    If no chunks were found (no documents selected or ingested), the model
    answers from its own knowledge and says so.
    """
    if not chunks:
        return (
            "You are a helpful teaching assistant. "
            "Answer the student's question as clearly and helpfully as you can. "
            "No course materials were selected, so answer from general knowledge."
        )

    context_parts = [
        f"[CHUNK_START id=chunk_{i}]\n{chunk['text']}\n[CHUNK_END]"
        for i, chunk in enumerate(chunks, 1)
    ]

    context = "\n\n".join(context_parts)

    return f"""\
You are a helpful teaching assistant. Answer the student's question thoroughly and clearly, \
grounding your answer in the provided course material context below.

Citation rules (follow exactly):
- After each factual claim drawn from a chunk, place an inline citation: <<chunk_id>>
- Use only the chunk IDs that appear in the context (chunk_1, chunk_2, …). Never invent IDs.
- Multiple supporting chunks: <<chunk_1,chunk_2>>
- Do NOT use [1], (1), footnotes, or any other citation format.
- If the context does not cover part of the question, say so.

Course Material Context:

{context}

Examples:
  Correct: The mitochondria produces ATP through oxidative phosphorylation<<chunk_2>>.
  Correct (multi): This is supported by both sources<<chunk_1,chunk_3>>.
  Wrong:   The mitochondria produces ATP [1]
  Wrong:   The mitochondria produces ATP<<chunk_99>>
"""


async def collect_llm_response(
    openrouter_key: str,
    model: str,
    messages: list[dict],
    system_prompt: str,
) -> str:
    """Collect the full LLM response without streaming."""
    logger.info("LLM collect — model=%s messages=%d system_prompt_chars=%d",
                model, len(messages), len(system_prompt))

    client = AsyncOpenAI(
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
    )
    full_messages = [{"role": "system", "content": system_prompt}, *messages]

    t0 = time.monotonic()
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=False,
            temperature=0.4,
        )
        content = response.choices[0].message.content or ""
        logger.info("LLM collect finished — chars=%d time=%.2fs", len(content), time.monotonic() - t0)
        return content
    except Exception:
        logger.exception("LLM collect failed after %.2fs", time.monotonic() - t0)
        raise


async def replay_as_stream(text: str) -> AsyncGenerator[str, None]:
    """Yield validated text word-by-word for fake streaming."""
    words = text.split(" ")
    for i, word in enumerate(words):
        yield word if i == 0 else " " + word


async def stream_llm_response(
    openrouter_key: str,
    model: str,
    messages: list[dict],
    system_prompt: str,
) -> AsyncGenerator[str, None]:
    """Stream text tokens from OpenRouter using the OpenAI-compatible API."""
    logger.info("LLM request — model=%s messages=%d system_prompt_chars=%d",
                model, len(messages), len(system_prompt))

    client = AsyncOpenAI(
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
    )
    full_messages = [{"role": "system", "content": system_prompt}, *messages]

    t0 = time.monotonic()
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=True,
            temperature=0.4,
        )
        logger.info("LLM stream opened (%.2fs to first response)", time.monotonic() - t0)
    except Exception:
        logger.exception("LLM request failed after %.2fs", time.monotonic() - t0)
        raise

    token_count = 0
    first_token_logged = False
    try:
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                if not first_token_logged:
                    logger.info("First token received (%.2fs)", time.monotonic() - t0)
                    first_token_logged = True
                token_count += 1
                yield delta
    except Exception:
        logger.exception("Error while reading LLM stream after %d tokens", token_count)
        raise
    finally:
        logger.info("LLM stream finished — tokens=%d total_time=%.2fs", token_count, time.monotonic() - t0)

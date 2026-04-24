from __future__ import annotations

from typing import AsyncGenerator

from openai import AsyncOpenAI


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

    context_parts = [f"[{i}]\n{chunk['text']}" for i, chunk in enumerate(chunks, 1)]
    context = "\n\n---\n\n".join(context_parts)
    return (
        "You are a helpful teaching assistant. "
        "Use the following excerpts from the student's course materials to answer their question.\n\n"
        f"Course Material Context:\n{context}\n\n"
        "Answer based on the context above. "
        "If the context doesn't contain enough information to answer fully, say so."
    )


async def stream_llm_response(
    openrouter_key: str,
    model: str,
    messages: list[dict],
    system_prompt: str,
) -> AsyncGenerator[str, None]:
    """Stream text tokens from OpenRouter using the OpenAI-compatible API."""
    client = AsyncOpenAI(
        api_key=openrouter_key,
        base_url="https://openrouter.ai/api/v1",
    )
    full_messages = [{"role": "system", "content": system_prompt}, *messages]
    stream = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        stream=True,
        temperature=0.4,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

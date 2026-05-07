from __future__ import annotations

import asyncio
import json
import logging
import re

from db.documents import get_parent_chunks_for_documents, get_total_token_count
from services.llm import collect_llm_response

logger = logging.getLogger(__name__)

BATCH_SIZE = 20


def _parse_json_response(raw: str) -> dict:
    """Extract {title, content} from an LLM response that may include markdown fences."""
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        parsed = json.loads(text)
        return {"title": str(parsed["title"]), "content": str(parsed["content"])}
    except (json.JSONDecodeError, KeyError):
        logger.warning("Failed to parse summary JSON, using raw response as content")
        return {"title": "Summary", "content": raw.strip()}


async def _call_batch_summary(
    text: str,
    openrouter_key: str,
    model: str,
) -> str:
    system = "You are an expert academic summarizer. Produce thorough, detailed summaries."
    user = (
        "Summarize the following course material excerpts. "
        "Be comprehensive and preserve all key concepts, definitions, and details.\n\n"
        f"{text}"
    )
    return await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )


async def _call_final_summary(
    text: str,
    openrouter_key: str,
    model: str,
    is_combining: bool,
) -> dict:
    system = (
        "You are an expert academic summarizer. "
        "Respond ONLY with valid JSON — no extra text before or after."
    )
    if is_combining:
        instruction = (
            "You are given partial summaries of course documents. "
            "Combine them into a single comprehensive, well-structured final summary."
        )
    else:
        instruction = "Summarize the following course documents into a comprehensive, well-structured summary."

    user = (
        f"{instruction}\n\n"
        "Respond ONLY with this JSON format:\n"
        '{"title": "...", "content": "..."}\n\n'
        "- title: a concise 5-10 word title describing the subject matter\n"
        "- content: a thorough summary using markdown (headers, bullets) for clarity\n\n"
        f"{'Partial summaries' if is_combining else 'Documents'}:\n{text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    return _parse_json_response(raw)


async def run_summarization(
    pool,
    document_ids: list[str],
    openrouter_key: str,
    model: str,
    context_limit: int,
) -> dict:
    """Orchestrate summarization. Returns {title: str, content: str}."""
    total_tokens = await get_total_token_count(pool, document_ids)
    threshold = context_limit * 0.6
    logger.info(
        "Summarization: %d docs, %d total tokens, threshold=%d",
        len(document_ids), total_tokens, threshold,
    )

    parent_chunks = await get_parent_chunks_for_documents(pool, document_ids)
    if not parent_chunks:
        return {"title": "Empty Summary", "content": "No content found for the selected documents."}

    texts = [chunk["text"] for chunk in parent_chunks]

    if total_tokens < threshold:
        logger.info("Single-prompt path (%d tokens < %.0f threshold)", total_tokens, threshold)
        combined = "\n\n---\n\n".join(texts)
        return await _call_final_summary(combined, openrouter_key, model, is_combining=False)

    batches = [texts[i:i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)]
    logger.info("Batch path: %d chunks/batch, %d batches (parallel)", BATCH_SIZE, len(batches))
    batch_summaries: list[str] = list(await asyncio.gather(*[
        _call_batch_summary("\n\n---\n\n".join(batch), openrouter_key, model)
        for batch in batches
    ]))

    combined_batches = "\n\n---\n\n".join(
        f"[Batch {i + 1}]\n{s}" for i, s in enumerate(batch_summaries)
    )
    return await _call_final_summary(combined_batches, openrouter_key, model, is_combining=True)

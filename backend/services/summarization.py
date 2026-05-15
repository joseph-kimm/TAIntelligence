from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from db.documents import get_full_texts_for_documents, get_parent_chunks_for_documents, get_total_token_count
from services.llm import collect_llm_response

logger = logging.getLogger(__name__)

BATCH_SIZE = 20

_DETAIL_INSTRUCTIONS = {
    1: "Write a very brief TL;DR-style summary — just the most essential points.",
    2: "Write a concise summary suitable for a quick read.",
    3: "Write a balanced summary covering the main points.",
    4: "Write a thorough, in-depth summary.",
    5: "Write an exhaustive summary covering all details and nuances.",
}

_AUDIENCE_INSTRUCTIONS = {
    1: "Explain as if to a 5-year-old (ELI5): use very simple language, analogies, and avoid jargon.",
    2: "Write for a high school student: clear language, some technical terms explained.",
    3: "Write for a college student: assume foundational knowledge, use appropriate terminology.",
    4: "Write for a professional: assume detailed knowledge and always use proper terminology and jargons"
}

_STYLE_INSTRUCTIONS = {
    "bullet_points": "Format the content primarily as bullet points.",
    "paragraph": "Write in flowing prose paragraphs without bullet points.",
    "table": "Organize information into tables where appropriate.",
    "structured": "Use clear headers with paragraphs under each section.",
    "qa": "Format the content as question-and-answer pairs.",
}

_TONE_INSTRUCTIONS = {
    "neutral": "Use a neutral, objective tone.",
    "academic": "Use a formal, academic tone with precise terminology.",
    "conversational": "Use a friendly, conversational tone.",
}

_FOCUS_LABELS = {
    "concepts": "key concepts and definitions",
    "examples": "examples and case studies",
    "arguments": "arguments and evidence",
    "timeline": "timeline and chronology",
    "formulas": "formulas and equations",
}


@dataclass
class SummaryOptions:
    detail_level: int = 0
    length_auto: bool = True
    length_minutes: int = 5
    audience: int = 0
    style: str | None = None
    tone: str | None = None
    focus_emphasis: list[str] = field(default_factory=list)


def _build_options_prompt(options: SummaryOptions) -> str:
    parts = []

    if options.detail_level in _DETAIL_INSTRUCTIONS:
        parts.append(_DETAIL_INSTRUCTIONS[options.detail_level])

    if not options.length_auto:
        words = options.length_minutes * 150
        parts.append(f"Aim for approximately a {options.length_minutes}-minute read (~{words} words).")

    if options.audience in _AUDIENCE_INSTRUCTIONS:
        parts.append(_AUDIENCE_INSTRUCTIONS[options.audience])

    if options.style and options.style in _STYLE_INSTRUCTIONS:
        parts.append(_STYLE_INSTRUCTIONS[options.style])

    if options.tone and options.tone in _TONE_INSTRUCTIONS:
        parts.append(_TONE_INSTRUCTIONS[options.tone])

    focus_labels = [_FOCUS_LABELS[f] for f in options.focus_emphasis if f in _FOCUS_LABELS]
    if focus_labels:
        parts.append(f"Focus especially on: {', '.join(focus_labels)}.")

    return " ".join(parts)


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
    options_prompt: str,
) -> dict:
    system = (
        "You are an expert academic summarizer. "
        "Respond ONLY with valid JSON — no extra text before or after."
    )
    if is_combining:
        instruction = "You are given partial summaries of course documents. Combine them into a single comprehensive, well-structured final summary."
    else:
        instruction = "Summarize the following course documents into a comprehensive, well-structured summary."

    if options_prompt:
        instruction = f"{instruction} {options_prompt}"

    user = (
        f"{instruction}\n\n"
        "Respond ONLY with this JSON format:\n"
        '{"title": "...", "content": "..."}\n\n'
        "- title: a concise 5-10 word title describing the subject matter\n"
        "- content: a thorough summary using markdown for clarity\n\n"
        f"{'Partial summaries' if is_combining else 'Documents'}:\n{text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    return _parse_json_response(raw)


async def run_structure_edit(
    existing_content: str,
    instruction: str,
    openrouter_key: str,
    model: str,
) -> str:
    """Reformat or restyle a summary without adding new information. Returns updated content."""
    system = (
        "You are a document formatter. "
        "Change the format or tone of the summary exactly as instructed. "
        "Do NOT add new facts, change substance, or remove content. "
        "Respond ONLY with the reformatted markdown content — no JSON, no preamble."
    )
    user = (
        "Here is an existing summary:\n\n"
        f"{existing_content}\n\n"
        f"Instruction: {instruction}\n\n"
        "Apply the formatting/style change and respond with only the updated markdown content."
    )
    return await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )


async def run_content_edit(
    existing_content: str,
    instruction: str,
    parent_chunks: list[dict],
    openrouter_key: str,
    model: str,
) -> str:
    """Update summary content by incorporating retrieved source excerpts. Returns updated content."""
    system = (
        "You are a content editor. "
        "Update the summary by selectively incorporating the provided source excerpts. "
        "Do not fully rewrite — only revise the specific parts that the instruction targets. "
        "Respond ONLY with the updated markdown content — no JSON, no preamble."
    )
    chunks_text = "\n\n".join(
        f"[EXCERPT {i + 1}]\n{chunk['text']}"
        for i, chunk in enumerate(parent_chunks)
    )
    user = (
        "Here is the existing summary:\n\n"
        f"{existing_content}\n\n"
        f"Instruction: {instruction}\n\n"
        "Source excerpts to draw from:\n\n"
        f"{chunks_text}\n\n"
        "Update only the relevant parts of the summary per the instruction. "
        "Keep rest of the summary as it is."
    )
    return await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )


async def run_summarization(
    pool,
    document_ids: list[str],
    openrouter_key: str,
    model: str,
    context_limit: int,
    options: SummaryOptions | None = None,
    on_progress: Callable[[dict], Awaitable[None]] | None = None,
) -> dict:
    """Orchestrate summarization. Returns {title: str, content: str}."""
    if options is None:
        options = SummaryOptions()

    options_prompt = _build_options_prompt(options)
    logger.info("Summary options prompt: %r", options_prompt or "(default)")

    if on_progress:
        await on_progress({"stage": "analyzing", "message": "Analyzing documents…"})

    total_tokens = await get_total_token_count(pool, document_ids)
    threshold = context_limit * 0.6
    logger.info(
        "Summarization: %d docs, %d total tokens, threshold=%d",
        len(document_ids), total_tokens, threshold,
    )

    if total_tokens < threshold:
        logger.info("Single-prompt path (%d tokens < %.0f threshold)", total_tokens, threshold)
        docs = await get_full_texts_for_documents(pool, document_ids)
        if not docs:
            return {"title": "Empty Summary", "content": "No content found for the selected documents."}
        missing = [d["title"] for d in docs if not d["full_text"]]
        if missing:
            raise ValueError(f"Documents missing stored text (re-ingest required): {', '.join(missing)}")
        if on_progress:
            await on_progress({"stage": "finalizing", "message": "Generating summary…"})
        combined = "\n\n---\n\n".join(d["full_text"] for d in docs)
        return await _call_final_summary(combined, openrouter_key, model, is_combining=False, options_prompt=options_prompt)

    parent_chunks = await get_parent_chunks_for_documents(pool, document_ids)
    if not parent_chunks:
        return {"title": "Empty Summary", "content": "No content found for the selected documents."}

    texts = [chunk["text"] for chunk in parent_chunks]
    batches = [texts[i:i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)]
    logger.info("Batch path: %d chunks/batch, %d batches (parallel)", BATCH_SIZE, len(batches))

    n = len(batches)
    if on_progress:
        await on_progress({
            "stage": "batching",
            "batch": 0,
            "total": n,
            "message": f"Processing {n} batch{'es' if n != 1 else ''} in parallel…",
        })

    completed_count = 0

    async def _run_batch_with_progress(batch_text: str) -> str:
        nonlocal completed_count
        result = await _call_batch_summary(batch_text, openrouter_key, model)
        completed_count += 1
        if on_progress:
            await on_progress({
                "stage": "batch",
                "batch": completed_count,
                "total": n,
                "message": f"Completed batch {completed_count} of {n}…",
            })
        return result

    batch_summaries: list[str] = list(await asyncio.gather(*[
        _run_batch_with_progress("\n\n---\n\n".join(batch))
        for batch in batches
    ]))

    if on_progress:
        await on_progress({"stage": "finalizing", "message": "Combining batches into final summary…"})

    combined_batches = "\n\n---\n\n".join(
        f"[Batch {i + 1}]\n{s}" for i, s in enumerate(batch_summaries)
    )
    return await _call_final_summary(combined_batches, openrouter_key, model, is_combining=True, options_prompt=options_prompt)

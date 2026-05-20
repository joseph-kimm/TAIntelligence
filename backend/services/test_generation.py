from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable

from db.chunks import get_parent_chunks_by_child_ids, search_chunks_by_embedding
from db.documents import get_full_texts_for_documents, get_parent_chunks_for_documents, get_total_token_count
from db.tests import get_question_set_with_questions, save_questions, update_test_objectives
from services.llm import collect_llm_response

logger = logging.getLogger(__name__)

BATCH_SIZE = 40

_PURPOSE_DESCRIPTIONS = {
    "quick_review": (
        "Purpose: QUICK REVIEW — focus on fundamental recall. "
        "Questions should test definitions, key terms, and basic facts directly stated in the material."
    ),
    "exam_prep": (
        "Purpose: EXAM PREP — mix recall with application. "
        "Include questions that require understanding how concepts relate or apply to simple scenarios."
    ),
    "deep_application": (
        "Purpose: DEEP APPLICATION — focus on analysis and synthesis. "
        "Questions should require students to compare, evaluate, or apply concepts to novel situations."
    ),
}


def _extract_json(raw: str) -> str:
    """Strip markdown code fences if present."""
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    return fenced.group(1) if fenced else raw.strip()


async def _extract_objectives_batch(
    text: str,
    purpose: str,
    openrouter_key: str,
    model: str,
) -> list[str]:
    """Extract learning objectives from a chunk of text. Returns a list of objective strings."""
    purpose_desc = _PURPOSE_DESCRIPTIONS.get(purpose, "")
    system = (
        "You are an expert instructional designer. "
        "Extract learning objectives from the provided course material. "
        "Each objective must start with an action verb (e.g. Explain, Apply, Analyze, Evaluate, Compare, Describe). "
        "Return ONLY a JSON array of strings — no preamble, no explanation. "
        f"{purpose_desc}"
    )
    user = (
        "Extract as many distinct, testable learning objectives as you can find in the following course material.\n\n"
        "Return ONLY a JSON array of strings:\n"
        '["Explain the role of mitochondria in ATP production", "Compare aerobic and anaerobic respiration", ...]\n\n'
        f"Course material:\n\n{text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    try:
        parsed = json.loads(_extract_json(raw))
        if isinstance(parsed, list):
            return [str(o).strip() for o in parsed if str(o).strip()]
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse objectives JSON, falling back to line parsing")
        return [line.strip(" -•*") for line in raw.splitlines() if line.strip(" -•*")]
    return []


async def _select_objectives(
    all_objectives: list[str],
    mcq_count: int,
    frq_count: int,
    purpose: str,
    already_tested: list[str],
    openrouter_key: str,
    model: str,
) -> dict[str, list[str]]:
    """Select exactly mcq_count MCQ + frq_count FRQ objectives from the combined pool."""
    total = mcq_count + frq_count
    purpose_desc = _PURPOSE_DESCRIPTIONS.get(purpose, "")
    system = (
        "You are an expert instructional designer. "
        "Select the best learning objectives for a test, avoiding redundancy and maximizing coverage. "
        f"{purpose_desc}"
    )
    objectives_text = "\n".join(f"- {o}" for o in all_objectives)
    already_tested_clause = ""
    if already_tested:
        already_tested_text = "\n".join(f"- {o}" for o in already_tested)
        already_tested_clause = (
            "\nThe following objectives have already been tested in previous question sets — "
            "avoid selecting them or any semantically similar objectives:\n"
            f"{already_tested_text}\n"
        )
    user = (
        f"From the following learning objectives, select exactly {mcq_count} best suited for "
        f"multiple-choice questions (MCQ) and exactly {frq_count} best suited for "
        f"free-response questions (FRQ).\n\n"
        "MCQ: prefer objectives testing recall, recognition, or straightforward application.\n"
        "FRQ: prefer objectives requiring explanation, analysis, comparison, or synthesis.\n\n"
        "Prioritize coverage and diversity — avoid selecting near-duplicate objectives.\n"
        f"{already_tested_clause}"
        f"If fewer than {total} objectives are available, select as many as possible.\n\n"
        "Return ONLY JSON in this exact format:\n"
        '{"mcq": ["objective 1", ...], "frq": ["objective 1", ...]}\n\n'
        f"Learning objectives:\n{objectives_text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    try:
        parsed = json.loads(_extract_json(raw))
        return {
            "mcq": [str(o) for o in parsed.get("mcq", [])][:mcq_count],
            "frq": [str(o) for o in parsed.get("frq", [])][:frq_count],
        }
    except (json.JSONDecodeError, KeyError, ValueError):
        logger.warning("Failed to parse objective selection JSON")
        half = total // 2
        return {"mcq": all_objectives[:mcq_count], "frq": all_objectives[half:half + frq_count]}


def _validate_mcq(data: dict) -> bool:
    options = data.get("options", [])
    if len(options) != 4:
        return False
    correct_count = sum(1 for o in options if o.get("is_correct") is True)
    if correct_count != 1:
        return False
    return all(
        str(o.get("content", "")).strip() and str(o.get("explanation", "")).strip()
        for o in options
    )


def _validate_frq(data: dict) -> bool:
    if not str(data.get("question", "")).strip():
        return False
    if not str(data.get("ideal_answer", "")).strip():
        return False
    rubric = data.get("rubric", [])
    if not (2 <= len(rubric) <= 4):
        return False
    return all(
        str(r.get("criterion", "")).strip() and isinstance(r.get("points"), (int, float)) and r["points"] > 0
        for r in rubric
    )


async def _generate_mcq(
    objective: str,
    context_text: str,
    purpose: str,
    openrouter_key: str,
    model: str,
) -> dict | None:
    purpose_desc = _PURPOSE_DESCRIPTIONS.get(purpose, "")
    system = (
        "You are an expert test writer. "
        "Generate high-quality multiple-choice questions grounded in the provided course material. "
        f"{purpose_desc}"
    )
    user = (
        f"Learning objective: {objective}\n\n"
        "Generate one multiple-choice question for the above objective using the course material below.\n\n"
        "Requirements:\n"
        "- Exactly 4 options\n"
        "- Exactly 1 correct option (is_correct: true)\n"
        "- All 4 options must have a non-empty explanation (why the option is correct or incorrect)\n\n"
        "Return ONLY valid JSON in this exact format:\n"
        "{\n"
        '  "question": "...",\n'
        '  "options": [\n'
        '    {"content": "...", "is_correct": true, "explanation": "..."},\n'
        '    {"content": "...", "is_correct": false, "explanation": "..."},\n'
        '    {"content": "...", "is_correct": false, "explanation": "..."},\n'
        '    {"content": "...", "is_correct": false, "explanation": "..."}\n'
        "  ]\n"
        "}\n\n"
        f"Course material:\n\n{context_text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    try:
        data = json.loads(_extract_json(raw))
        if _validate_mcq(data):
            return data
        logger.warning("MCQ validation failed for objective: %r", objective[:60])
    except (json.JSONDecodeError, ValueError):
        logger.warning("MCQ JSON parse failed for objective: %r", objective[:60])
    return None


async def _generate_frq(
    objective: str,
    context_text: str,
    purpose: str,
    openrouter_key: str,
    model: str,
) -> dict | None:
    purpose_desc = _PURPOSE_DESCRIPTIONS.get(purpose, "")
    system = (
        "You are an expert test writer. "
        "Generate high-quality free-response questions grounded in the provided course material. "
        f"{purpose_desc}"
    )
    user = (
        f"Learning objective: {objective}\n\n"
        "Generate one free-response question for the above objective using the course material below.\n\n"
        "Requirements:\n"
        "- A clear, open-ended question\n"
        "- An ideal answer\n"
        "- A rubric with 2–4 criteria, each with a point value (integer > 0)\n\n"
        "Return ONLY valid JSON in this exact format:\n"
        "{\n"
        '  "question": "...",\n'
        '  "ideal_answer": "...",\n'
        '  "rubric": [\n'
        '    {"criterion": "...", "points": 2},\n'
        '    {"criterion": "...", "points": 3}\n'
        "  ]\n"
        "}\n\n"
        f"Course material:\n\n{context_text}"
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    try:
        data = json.loads(_extract_json(raw))
        if _validate_frq(data):
            return data
        logger.warning("FRQ validation failed for objective: %r", objective[:60])
    except (json.JSONDecodeError, ValueError):
        logger.warning("FRQ JSON parse failed for objective: %r", objective[:60])
    return None


async def _generate_question_with_retry(
    objective: str,
    q_type: str,
    pool,
    course_id: str,
    document_ids: list[str],
    embed_model,
    purpose: str,
    openrouter_key: str,
    model: str,
) -> tuple[dict, list[str]] | None:
    """Retrieve context for an objective then generate + validate a question. Retries once.

    Returns (question_dict, parent_chunk_ids) or None if both attempts fail.
    """
    generate_fn = _generate_mcq if q_type == "mcq" else _generate_frq

    for attempt in range(2):
        embedding = await asyncio.to_thread(embed_model.get_text_embedding, objective)
        child_chunks = await search_chunks_by_embedding(
            pool, embedding, course_id=course_id, document_ids=document_ids, limit=5
        )
        child_ids = [c["id"] for c in child_chunks]
        parent_chunks = await get_parent_chunks_by_child_ids(pool, child_ids)
        context_text = "\n\n".join(
            f"[EXCERPT {i + 1}]\n{chunk['text']}" for i, chunk in enumerate(parent_chunks)
        )
        result = await generate_fn(objective, context_text, purpose, openrouter_key, model)
        if result is not None:
            return result, child_ids
        if attempt == 0:
            logger.info("Retrying %s question for objective: %r", q_type.upper(), objective[:60])

    logger.warning("Skipping %s question after 2 failed attempts: %r", q_type.upper(), objective[:60])
    return None


async def run_test_generation(
    pool,
    question_set_id: str,
    test_id: str,
    course_id: str,
    document_ids: list[str],
    mcq_count: int,
    frq_count: int,
    purpose: str,
    all_objectives: list[str] | None,
    already_tested: list[str],
    openrouter_key: str,
    model: str,
    context_limit: int,
    embed_model,
    on_progress: Callable[[dict], Awaitable[None]] | None = None,
) -> dict:
    """Orchestrate test generation. Returns the question set dict with questions."""

    async def _progress(event: dict) -> None:
        if on_progress:
            await on_progress(event)

    # ── Phase 1: Extract objectives (only on first generation) ───────────────
    if all_objectives is None:
        await _progress({"stage": "analyzing", "message": "Analyzing documents…"})

        total_tokens = await get_total_token_count(pool, document_ids)
        threshold = context_limit * 0.6
        logger.info(
            "Test generation: %d docs, %d total tokens, threshold=%d",
            len(document_ids), total_tokens, threshold,
        )

        if total_tokens < threshold:
            docs = await get_full_texts_for_documents(pool, document_ids)
            combined_text = "\n\n---\n\n".join(d["full_text"] for d in docs if d.get("full_text"))
            await _progress({"stage": "extracting_objectives", "message": "Extracting learning objectives…"})
            all_objectives = await _extract_objectives_batch(combined_text, purpose, openrouter_key, model)
        else:
            parent_chunks = await get_parent_chunks_for_documents(pool, document_ids)
            texts = [chunk["text"] for chunk in parent_chunks]
            batches = [texts[i:i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)]
            n = len(batches)
            await _progress({
                "stage": "extracting_objectives",
                "message": f"Extracting objectives from {n} batch{'es' if n != 1 else ''} in parallel…",
            })
            batch_results: list[list[str]] = list(await asyncio.gather(*[
                _extract_objectives_batch("\n\n---\n\n".join(batch), purpose, openrouter_key, model)
                for batch in batches
            ]))
            all_objectives = [obj for batch in batch_results for obj in batch]

        logger.info("Extracted %d raw objectives", len(all_objectives))
        await update_test_objectives(pool, test_id, all_objectives)
    else:
        logger.info("Reusing %d stored objectives for test %s", len(all_objectives), test_id)

    await _progress({
        "stage": "objectives_extracted",
        "message": f"Using {len(all_objectives)} objectives. Selecting the most relevant…",
    })

    # ── Phase 2: Select objectives ───────────────────────────────────────────
    if not all_objectives:
        logger.warning("No objectives available — saving question set with 0 questions")
        return await get_question_set_with_questions(pool, question_set_id)

    selected = await _select_objectives(all_objectives, mcq_count, frq_count, purpose, already_tested, openrouter_key, model)
    mcq_objectives = selected["mcq"]
    frq_objectives = selected["frq"]
    total_questions = len(mcq_objectives) + len(frq_objectives)
    logger.info("Selected %d MCQ + %d FRQ objectives", len(mcq_objectives), len(frq_objectives))

    # ── Phase 3: Generate questions in parallel ──────────────────────────────
    completed_count = 0

    async def _gen_and_track(
        objective: str, q_type: str
    ) -> tuple[str, str, dict, list[str]] | tuple[str, str, None, None]:
        nonlocal completed_count
        outcome = await _generate_question_with_retry(
            objective, q_type, pool, course_id, document_ids,
            embed_model, purpose, openrouter_key, model,
        )
        completed_count += 1
        await _progress({
            "stage": "question",
            "completed": completed_count,
            "total": total_questions,
            "message": f"Generated question {completed_count} of {total_questions}…",
        })
        if outcome is None:
            return (objective, q_type, None, None)
        result, chunk_ids = outcome
        return (objective, q_type, result, chunk_ids)

    tasks = (
        [_gen_and_track(obj, "mcq") for obj in mcq_objectives]
        + [_gen_and_track(obj, "frq") for obj in frq_objectives]
    )
    task_results = list(await asyncio.gather(*tasks))

    # ── Phase 4: Assemble + save ─────────────────────────────────────────────
    questions_to_save: list[dict] = []
    frq_offset = sum(1 for _, q_type, result, _ in task_results if q_type == "mcq" and result is not None)
    frq_pos_cursor = frq_offset
    mcq_pos_cursor = 0

    for objective, q_type, result, chunk_ids in task_results:
        if result is None:
            continue
        if q_type == "mcq":
            questions_to_save.append({
                "position": mcq_pos_cursor,
                "question_type": "mcq",
                "content": result["question"],
                "learning_objective": objective,
                "source_chunk_ids": chunk_ids or [],
                "options": [
                    {
                        "position": i,
                        "content": opt["content"],
                        "is_correct": opt["is_correct"],
                        "explanation": opt.get("explanation", ""),
                    }
                    for i, opt in enumerate(result["options"])
                ],
            })
            mcq_pos_cursor += 1
        else:
            questions_to_save.append({
                "position": frq_pos_cursor,
                "question_type": "frq",
                "content": result["question"],
                "learning_objective": objective,
                "source_chunk_ids": chunk_ids or [],
                "ideal_answer": result.get("ideal_answer", ""),
                "rubric": [
                    {"criterion": r["criterion"], "points": int(r["points"])}
                    for r in result.get("rubric", [])
                ],
            })
            frq_pos_cursor += 1

    logger.info(
        "Saving %d questions (%d MCQ, %d FRQ) for question_set %s",
        len(questions_to_save),
        mcq_pos_cursor,
        frq_pos_cursor - frq_offset,
        question_set_id,
    )
    await save_questions(pool, question_set_id, questions_to_save)
    return await get_question_set_with_questions(pool, question_set_id)

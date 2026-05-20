from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable

from db.tests import get_attempt, submit_attempt
from services.llm import collect_llm_response

logger = logging.getLogger(__name__)


def _extract_json(raw: str) -> str:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    return fenced.group(1) if fenced else raw.strip()


async def grade_frq(
    question_content: str,
    response_text: str,
    ideal_answer: str,
    rubric: list[dict],
    max_points: float,
    openrouter_key: str,
    model: str,
) -> dict:
    rubric_text = "\n".join(
        f"- {r['criterion']} ({r['points']} point{'s' if r['points'] != 1 else ''})"
        for r in rubric
    )
    system = "You are a fair and accurate grader. Evaluate student responses objectively."
    user = (
        f"Question: {question_content}\n\n"
        f"Ideal Answer: {ideal_answer}\n\n"
        f"Grading Rubric (total {max_points} points):\n{rubric_text}\n\n"
        f"Student Response: {response_text or '(no response)'}\n\n"
        f"Score the student response from 0 to {max_points} points based on the rubric. "
        "Provide 1-2 sentences of specific feedback.\n\n"
        'Return ONLY valid JSON: {"score": <number>, "feedback": "<string>"}'
    )
    raw = await collect_llm_response(
        openrouter_key=openrouter_key,
        model=model,
        messages=[{"role": "user", "content": user}],
        system_prompt=system,
    )
    try:
        parsed = json.loads(_extract_json(raw))
        score = float(parsed["score"])
        score = max(0.0, min(float(max_points), score))
        feedback = str(parsed.get("feedback", "")).strip()
        return {"score": score, "feedback": feedback}
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        logger.warning("FRQ grading parse failed, defaulting to 0")
        return {"score": 0.0, "feedback": "Could not be graded."}


async def run_grading(
    pool,
    attempt_id: str,
    question_set_with_questions: dict,
    raw_answers: list[dict],
    question_order: list[str],
    option_orders: dict[str, list[str]],
    openrouter_key: str,
    model: str,
    on_progress: Callable[[dict], Awaitable[None]] | None = None,
) -> dict:
    """Grade all questions, save to DB, return the final attempt dict."""

    async def _progress(event: dict) -> None:
        if on_progress:
            await on_progress(event)

    questions = question_set_with_questions.get("questions", [])
    answers_by_question = {a["question_id"]: a for a in raw_answers}

    total = len(questions)
    completed = 0

    # Build max_score: 2 per MCQ, sum of rubric points per FRQ
    def _frq_max(q: dict) -> float:
        answer = q.get("answer") or {}
        rubric = answer.get("rubric") or []
        return float(sum(r.get("points", 0) for r in rubric)) or 1.0

    max_score = sum(
        2.0 if q["question_type"] == "mcq" else _frq_max(q)
        for q in questions
    )

    graded_answers: list[dict] = []

    async def _grade_one(q: dict) -> dict:
        nonlocal completed
        q_id = q["id"]
        raw = answers_by_question.get(q_id, {})

        if q["question_type"] == "mcq":
            selected_option_id = raw.get("selected_option_id")
            correct_id = next(
                (opt["id"] for opt in q.get("options", []) if opt.get("is_correct")),
                None,
            )
            score = 2.0 if selected_option_id and selected_option_id == correct_id else 0.0
            result = {
                "question_id": q_id,
                "selected_option_id": selected_option_id,
                "response_text": None,
                "score": score,
                "feedback_text": None,
            }
        else:
            answer_data = q.get("answer") or {}
            rubric = answer_data.get("rubric") or []
            ideal = answer_data.get("ideal_answer") or ""
            frq_max = _frq_max(q)
            response_text = raw.get("response_text") or ""
            if not response_text.strip():
                grading = {"score": 0.0, "feedback": "No answer was provided."}
            else:
                grading = await grade_frq(
                    question_content=q["content"],
                    response_text=response_text,
                    ideal_answer=ideal,
                    rubric=rubric,
                    max_points=frq_max,
                    openrouter_key=openrouter_key,
                    model=model,
                )
            result = {
                "question_id": q_id,
                "selected_option_id": None,
                "response_text": response_text,
                "score": grading["score"],
                "feedback_text": grading["feedback"],
            }

        completed += 1
        await _progress({
            "stage": "grading",
            "completed": completed,
            "total": total,
            "message": f"Graded question {completed} of {total}…",
        })
        return result

    graded_answers = list(await asyncio.gather(*[_grade_one(q) for q in questions]))

    total_score = sum(a["score"] for a in graded_answers)
    await submit_attempt(pool, attempt_id, graded_answers, total_score, max_score, question_order, option_orders)
    return await get_attempt(pool, attempt_id)

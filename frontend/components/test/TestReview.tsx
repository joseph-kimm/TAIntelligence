"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import styles from "./TestReview.module.css";
import type { Question, TestAttemptDetail } from "@/types";

interface TestReviewProps {
  questions: Question[];
  attempt: TestAttemptDetail;
  onRetake: () => void;
  onRegenerate: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export default function TestReview({
  questions,
  attempt,
  onRetake,
  onRegenerate,
}: TestReviewProps) {
  const [shownIdeal, setShownIdeal] = useState<Set<string>>(new Set());
  const answersByQuestion = Object.fromEntries(
    attempt.answers.map((a) => [a.questionId, a]),
  );

  const displayQuestions = useMemo(() => {
    const { questionOrder, optionOrders } = attempt;
    if (!questionOrder?.length) return questions;

    const qOrderMap = new Map(questionOrder.map((id, i) => [id, i]));
    const sorted = [...questions].sort(
      (a, b) => (qOrderMap.get(a.id) ?? 999) - (qOrderMap.get(b.id) ?? 999),
    );
    return sorted.map((q) => {
      if (q.questionType !== "mcq" || !q.options) return q;
      const optOrder = optionOrders?.[q.id];
      if (!optOrder) return q;
      const oOrderMap = new Map(optOrder.map((id, i) => [id, i]));
      return {
        ...q,
        options: [...q.options].sort(
          (a, b) => (oOrderMap.get(a.id) ?? 999) - (oOrderMap.get(b.id) ?? 999),
        ),
      };
    });
  }, [questions, attempt]);

  const score = Number(attempt.score ?? 0);
  const maxScore = Number(attempt.maxScore ?? 0);
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  function toggleIdeal(qId: string) {
    setShownIdeal((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  }

  return (
    <div className={styles.review}>
      {/* Score banner */}
      <div className={styles.scoreBanner}>
        <span className={styles.scoreMain}>
          {score % 1 === 0 ? score : score.toFixed(1)} /{" "}
          {maxScore % 1 === 0 ? maxScore : maxScore.toFixed(1)} points
        </span>
        <span className={styles.scorePct}>{pct}%</span>
      </div>

      {/* Questions */}
      <div className={styles.questionList}>
        {displayQuestions.map((q, idx) => {
          const userAnswer = answersByQuestion[q.id];
          return (
            <div key={q.id} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNumber}>Q{idx + 1}</span>
                <span
                  className={`${styles.badge} ${q.questionType === "mcq" ? styles.mcqBadge : styles.frqBadge}`}
                >
                  {q.questionType === "mcq" ? "MCQ" : "FRQ"}
                </span>
                {userAnswer && (
                  <span className={styles.qScore}>
                    {Number(userAnswer.score ?? 0)} pt
                    {Number(userAnswer.score) !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <p className={styles.questionContent}>{q.content}</p>

              {q.questionType === "mcq" &&
                (() => {
                  const chosen = (q.options ?? []).find(
                    (o) => o.id === userAnswer?.selectedOptionId,
                  );
                  const chosenIdx = (q.options ?? []).findIndex(
                    (o) => o.id === userAnswer?.selectedOptionId,
                  );
                  const isCorrect = chosen?.isCorrect ?? false;

                  return (
                    <div className={styles.mcqReview}>
                      {chosen ? (
                        <div
                          className={`${styles.chosenOption} ${isCorrect ? styles.chosenCorrect : styles.chosenWrong}`}
                        >
                          <div className={styles.chosenRow}>
                            {isCorrect ? (
                              <CheckCircle
                                size={14}
                                className={styles.iconCorrect}
                              />
                            ) : (
                              <XCircle size={14} className={styles.iconWrong} />
                            )}
                            <span className={styles.chosenLabel}>
                              {OPTION_LABELS[chosenIdx] ?? "?"}
                            </span>
                            <span className={styles.chosenContent}>
                              {chosen.content}
                            </span>
                          </div>
                          {chosen.explanation && (
                            <p className={styles.chosenExplanation}>
                              {chosen.explanation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className={styles.unanswered}>Not answered</p>
                      )}
                    </div>
                  );
                })()}

              {q.questionType === "frq" && (
                <div className={styles.frqReview}>
                  <p className={styles.frqSectionLabel}>Your Response</p>
                  <p className={styles.frqResponse}>
                    {userAnswer?.responseText || (
                      <em className={styles.unanswered}>No response</em>
                    )}
                  </p>

                  {userAnswer?.feedbackText && (
                    <>
                      <p className={styles.frqSectionLabel}>Feedback</p>
                      <p className={styles.frqFeedback}>
                        {userAnswer.feedbackText}
                      </p>
                    </>
                  )}

                  <button
                    className={styles.idealToggle}
                    onClick={() => toggleIdeal(q.id)}
                  >
                    {shownIdeal.has(q.id) ? (
                      <EyeOff size={13} />
                    ) : (
                      <Eye size={13} />
                    )}
                    {shownIdeal.has(q.id)
                      ? "Hide Ideal Answer"
                      : "Show Ideal Answer"}
                  </button>

                  {shownIdeal.has(q.id) && q.answer?.idealAnswer && (
                    <p className={styles.idealAnswer}>{q.answer.idealAnswer}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className={styles.reviewActions}>
        <button className={styles.retakeBtn} onClick={onRetake}>
          <RotateCcw size={15} />
          Retake Test
        </button>
        <button className={styles.regenBtn} onClick={onRegenerate}>
          <RefreshCw size={15} />
          Generate More Questions
        </button>
      </div>
    </div>
  );
}

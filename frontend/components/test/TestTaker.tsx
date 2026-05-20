'use client'

import { Loader2, Send } from 'lucide-react'
import styles from './TestTaker.module.css'
import type { Question } from '@/types'

type DraftAnswer = { selectedOptionId?: string; responseText?: string }

interface TestTakerProps {
  questions: Question[]
  draftAnswers: Record<string, DraftAnswer>
  onAnswerChange: (questionId: string, answer: DraftAnswer) => void
  onSubmit: () => void
  submitting: boolean
  onDirtyChange: (dirty: boolean) => void
}

const OPTION_LABELS = ['A', 'B', 'C', 'D']

export default function TestTaker({
  questions,
  draftAnswers,
  onAnswerChange,
  onSubmit,
  submitting,
  onDirtyChange,
}: TestTakerProps) {
  function handleMcqChange(questionId: string, optionId: string) {
    onDirtyChange(true)
    onAnswerChange(questionId, { selectedOptionId: optionId })
  }

  function handleFrqChange(questionId: string, text: string) {
    onDirtyChange(true)
    onAnswerChange(questionId, { responseText: text })
  }

  return (
    <div className={styles.taker}>
      <div className={styles.questionList}>
        {questions.map((q, idx) => {
          const draft = draftAnswers[q.id] ?? {}
          return (
            <div key={q.id} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNumber}>Q{idx + 1}</span>
                <span className={`${styles.badge} ${q.questionType === 'mcq' ? styles.mcqBadge : styles.frqBadge}`}>
                  {q.questionType === 'mcq' ? 'MCQ' : 'FRQ'}
                </span>
              </div>
              <p className={styles.questionContent}>{q.content}</p>

              {q.questionType === 'mcq' && (
                <div className={styles.optionsList}>
                  {(q.options ?? []).map((opt, oi) => {
                    const selected = draft.selectedOptionId === opt.id
                    return (
                      <button
                        key={opt.id}
                        className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
                        onClick={() => handleMcqChange(q.id, opt.id)}
                        disabled={submitting}
                      >
                        <span className={styles.optionLabel}>{OPTION_LABELS[oi]}</span>
                        <span className={styles.optionContent}>{opt.content}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {q.questionType === 'frq' && (
                <textarea
                  className={styles.frqTextarea}
                  placeholder="Write your answer here…"
                  value={draft.responseText ?? ''}
                  onChange={(e) => handleFrqChange(q.id, e.target.value)}
                  disabled={submitting}
                  rows={5}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.submitRow}>
        <button
          className={styles.submitBtn}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 size={16} className={styles.spinIcon} /> Submitting…</>
          ) : (
            <><Send size={16} /> Submit Test</>
          )}
        </button>
      </div>
    </div>
  )
}

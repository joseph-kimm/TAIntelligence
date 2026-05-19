'use client'

import { Loader2, ClipboardList } from 'lucide-react'
import styles from './TestTab.module.css'
import type { Question } from '@/types'

interface QuestionViewerProps {
  questions: Question[] | null
  loading: boolean
}

export default function QuestionViewer({ questions, loading }: QuestionViewerProps) {
  if (loading) {
    return (
      <div className={styles.emptyState}>
        <Loader2 size={32} className={styles.spinIcon} color="var(--primary)" />
        <p className={styles.emptyBody}>Loading questions…</p>
      </div>
    )
  }

  if (!questions || questions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <ClipboardList size={40} color="var(--on-surface-variant)" strokeWidth={1.5} />
        <p className={styles.emptyTitle}>No questions</p>
        <p className={styles.emptyBody}>This test has no questions. Try generating a new one.</p>
      </div>
    )
  }

  return (
    <div className={styles.questionList}>
      {questions.map((q, idx) => (
        <div key={q.id} className={styles.questionCard}>
          <div className={styles.questionHeader}>
            <span className={styles.questionNumber}>Q{idx + 1}</span>
            <span
              className={`${styles.questionTypeBadge} ${
                q.questionType === 'mcq' ? styles.mcqBadge : styles.frqBadge
              }`}
            >
              {q.questionType === 'mcq' ? 'MCQ' : 'FRQ'}
            </span>
          </div>

          {q.learningObjective && (
            <p className={styles.questionObjective}>{q.learningObjective}</p>
          )}

          <p className={styles.questionContent}>{q.content}</p>

          {q.questionType === 'mcq' && q.options && (
            <div className={styles.optionsList}>
              {q.options.map((opt, oi) => (
                <div
                  key={opt.id}
                  className={`${styles.option} ${opt.isCorrect ? styles.optionCorrect : styles.optionWrong}`}
                >
                  <span className={styles.optionLabel}>{String.fromCharCode(65 + oi)}</span>
                  <div className={styles.optionBody}>
                    <span className={styles.optionContent}>{opt.content}</span>
                    {opt.explanation && (
                      <span className={styles.optionExplanation}>{opt.explanation}</span>
                    )}
                  </div>
                  {opt.isCorrect && <span className={styles.optionIndicator}>✓</span>}
                </div>
              ))}
            </div>
          )}

          {q.questionType === 'frq' && q.answer && (
            <div className={styles.frqSection}>
              <p className={styles.frqLabel}>Ideal Answer</p>
              <p className={styles.frqAnswer}>{q.answer.idealAnswer}</p>
              {q.answer.rubric.length > 0 && (
                <>
                  <p className={styles.frqLabel}>Rubric</p>
                  <table className={styles.rubricTable}>
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.answer.rubric.map((r, ri) => (
                        <tr key={ri}>
                          <td>{r.criterion}</td>
                          <td>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

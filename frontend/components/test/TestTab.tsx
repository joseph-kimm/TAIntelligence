'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Clock, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import styles from './TestTab.module.css'
import TestForm from './TestForm'
import TestTaker from './TestTaker'
import TestReview from './TestReview'
import type { Question, QuestionSet, Section, Test, TestAttempt, TestAttemptDetail, TestPurpose } from '@/types'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

type ViewMode = 'form' | 'generating' | 'taking' | 'grading' | 'review' | 'past_attempt'
type DraftAnswer = { selectedOptionId?: string; responseText?: string }

interface TestTabProps {
  courseId: string
  selectedDocIds: Set<string>
  sections: Section[]
  tests: Test[]
  onTestCreated: (test: Test) => void
  onTestDeleted: (testId: string) => void
  onQuestionSetAdded: (testId: string, qs: QuestionSet) => void
  onQuestionSetDeleted: (testId: string, qsId: string) => void
}

const PURPOSE_LABELS: Record<string, string> = {
  quick_review: 'Quick Review',
  exam_prep: 'Exam Prep',
  deep_application: 'Deep Application',
}

function buildTestTitle(purpose: TestPurpose, sections: Section[], selectedDocIds: Set<string>): string {
  const docNames = sections
    .flatMap((s) => s.documents)
    .filter((d) => selectedDocIds.has(d.id) && d.ingestionStatus === 'complete')
    .map((d) => d.title)
    .join(', ')
  return `${PURPOSE_LABELS[purpose]} — ${docNames}`
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function applyShuffleToQuestions(questions: Question[]): Question[] {
  const mcqs = shuffleArray(
    questions.filter((q) => q.questionType === 'mcq').map((q) => ({
      ...q,
      options: shuffleArray(q.options ?? []),
    }))
  )
  const frqs = shuffleArray(questions.filter((q) => q.questionType === 'frq'))
  return [...mcqs, ...frqs]
}

function toQuestionSet(raw: Record<string, unknown>): QuestionSet {
  return {
    id: raw.id as string,
    testId: (raw.test_id as string) ?? '',
    setNumber: raw.set_number as number,
    mcqCount: (raw.mcq_count as number) ?? 0,
    frqCount: (raw.frq_count as number) ?? 0,
    createdAt: raw.created_at as string,
  }
}

function toTest(raw: Record<string, unknown>): Test {
  return {
    id: raw.id as string,
    courseId: (raw.course_id as string) ?? '',
    title: raw.title as string,
    sourceDocumentIds: (raw.source_document_ids as string[]) ?? [],
    purpose: raw.purpose as TestPurpose,
    createdAt: raw.created_at as string,
    questionSets: ((raw.question_sets as Record<string, unknown>[]) ?? []).map(toQuestionSet),
  }
}

function toQuestions(raw: unknown[]): Question[] {
  return (raw ?? []).map((q) => {
    const qd = q as Record<string, unknown>
    const base = {
      id: qd.id as string,
      questionSetId: (qd.question_set_id as string) ?? '',
      questionType: qd.question_type as 'mcq' | 'frq',
      content: qd.content as string,
      learningObjective: (qd.learning_objective as string | null) ?? null,
    }
    if (base.questionType === 'mcq') {
      const opts = (qd.options as Record<string, unknown>[]) ?? []
      return {
        ...base,
        options: opts.map((o) => ({
          id: o.id as string,
          questionId: o.question_id as string,
          content: o.content as string,
          isCorrect: o.is_correct as boolean,
          explanation: (o.explanation as string | null) ?? null,
        })),
      }
    }
    const ans = qd.answer as Record<string, unknown> | null
    return {
      ...base,
      answer: ans
        ? {
            id: ans.id as string,
            questionId: ans.question_id as string,
            idealAnswer: (ans.ideal_answer as string | null) ?? null,
            rubric: (ans.rubric as Array<{ criterion: string; points: number }>) ?? [],
          }
        : undefined,
    }
  })
}

function toAttempt(raw: Record<string, unknown>): TestAttempt {
  return {
    id: raw.id as string,
    questionSetId: raw.question_set_id as string,
    score: (raw.score as number | null) ?? null,
    maxScore: (raw.max_score as number | null) ?? null,
    submittedAt: (raw.submitted_at as string | null) ?? null,
    createdAt: raw.created_at as string,
  }
}

function toAttemptDetail(raw: Record<string, unknown>): TestAttemptDetail {
  return {
    ...toAttempt(raw),
    answers: ((raw.answers as Record<string, unknown>[]) ?? []).map((a) => ({
      id: a.id as string,
      attemptId: a.attempt_id as string,
      questionId: a.question_id as string,
      selectedOptionId: (a.selected_option_id as string | null) ?? null,
      responseText: (a.response_text as string | null) ?? null,
      score: (a.score as number | null) ?? null,
      feedbackText: (a.feedback_text as string | null) ?? null,
    })),
    questionOrder: (raw.question_order as string[]) ?? [],
    optionOrders: (raw.option_orders as Record<string, string[]>) ?? {},
  }
}

async function readSSE(
  res: Response,
  onProgress: (msg: string) => void,
): Promise<Record<string, unknown>> {
  if (!res.body) throw new Error('No response body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) throw new Error('SSE stream ended without done event')
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      let event: Record<string, unknown>
      try { event = JSON.parse(raw) } catch { continue }
      if (event.type === 'progress') onProgress(event.message as string)
      else if (event.type === 'done') return event
      else if (event.type === 'error') throw new Error((event.message as string) ?? 'Unknown error')
    }
  }
}

function formatQsLabel(qs: QuestionSet): string {
  const dt = new Date(qs.createdAt)
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `Set ${qs.setNumber} — ${date}, ${time}`
}

function formatAttemptLabel(attempt: TestAttempt, idx: number): string {
  const dt = new Date(attempt.createdAt)
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const score = attempt.score != null && attempt.maxScore != null
    ? ` · ${attempt.score}/${attempt.maxScore} pts`
    : ''
  return `Attempt ${idx + 1} — ${date}, ${time}${score}`
}

export default function TestTab({
  courseId,
  selectedDocIds,
  sections,
  tests,
  onTestCreated,
  onTestDeleted,
  onQuestionSetAdded,
  onQuestionSetDeleted,
}: TestTabProps) {
  const [historyVisible, setHistoryVisible] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('form')
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [activeQuestionSet, setActiveQuestionSet] = useState<QuestionSet | null>(null)
  const [activeQuestions, setActiveQuestions] = useState<Question[] | null>(null)
  const [attempts, setAttempts] = useState<TestAttempt[]>([])
  const [currentAttempt, setCurrentAttempt] = useState<TestAttemptDetail | null>(null)
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>({})
  const [genProgress, setGenProgress] = useState<string | null>(null)
  const [gradingProgress, setGradingProgress] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const [mcqCount, setMcqCount] = useState(10)
  const [frqCount, setFrqCount] = useState(3)
  const [purpose, setPurpose] = useState<TestPurpose>('quick_review')

  const isDirtyRef = useRef(false)

  function warnIfDirty(): boolean {
    if (isDirtyRef.current) {
      return window.confirm('You have unsaved answers. Leave the test?')
    }
    return true
  }

  function toggleGroup(testId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(testId)) next.delete(testId)
      else next.add(testId)
      return next
    })
  }

  async function handleQuestionSetClick(test: Test, qs: QuestionSet) {
    if (!warnIfDirty()) return
    isDirtyRef.current = false
    setHistoryVisible(false)
    setActiveTest(test)
    setActiveQuestionSet(qs)
    setDraftAnswers({})
    setCurrentAttempt(null)
    setViewMode('taking')

    const [qsRes, attRes] = await Promise.all([
      fetch(`/api/question-sets/${qs.id}`),
      fetch(`/api/question-sets/${qs.id}/attempts`),
    ])
    if (qsRes.ok) {
      const data = await qsRes.json()
      setActiveQuestions(applyShuffleToQuestions(toQuestions(data.questions ?? [])))
    }
    if (attRes.ok) {
      const data: Record<string, unknown>[] = await attRes.json()
      setAttempts(data.map(toAttempt))
    }
  }

  function handleNewTest() {
    if (!warnIfDirty()) return
    isDirtyRef.current = false
    setViewMode('form')
    setActiveTest(null)
    setActiveQuestionSet(null)
    setActiveQuestions(null)
    setAttempts([])
    setCurrentAttempt(null)
    setHistoryVisible(false)
    setGenError(null)
  }

  async function handleDeleteTest(test: Test, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/tests/${test.id}`, { method: 'DELETE' })
    onTestDeleted(test.id)
    if (activeTest?.id === test.id) {
      setViewMode('form')
      setActiveTest(null)
      setActiveQuestionSet(null)
      setActiveQuestions(null)
    }
  }

  async function handleDeleteQuestionSet(test: Test, qs: QuestionSet, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/question-sets/${qs.id}`, { method: 'DELETE' })
    onQuestionSetDeleted(test.id, qs.id)
    if (activeQuestionSet?.id === qs.id) {
      setViewMode('form')
      setActiveTest(null)
      setActiveQuestionSet(null)
      setActiveQuestions(null)
    }
  }

  async function handleGenerate() {
    if (!warnIfDirty()) return
    isDirtyRef.current = false
    setViewMode('generating')
    setGenProgress('Preparing…')
    setGenError(null)

    try {
      const docIds = sections
        .flatMap((s) => s.documents)
        .filter((d) => selectedDocIds.has(d.id) && d.ingestionStatus === 'complete')
        .map((d) => d.id)

      const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_ids: docIds,
          mcq_count: mcqCount,
          frq_count: frqCount,
          purpose,
          title: buildTestTitle(purpose, sections, selectedDocIds),
        }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)

      const event = await readSSE(res, setGenProgress)
      const newTest = toTest(event.test as Record<string, unknown>)
      const newQs = toQuestionSet(event.question_set as Record<string, unknown>)
      const newTest2 = { ...newTest, questionSets: [newQs] }
      const questions = toQuestions((event.questions as unknown[]) ?? [])

      onTestCreated(newTest2)
      setActiveTest(newTest2)
      setActiveQuestionSet(newQs)
      setActiveQuestions(applyShuffleToQuestions(questions))
      setAttempts([])
      setDraftAnswers({})
      setViewMode('taking')
    } catch {
      setGenError('Failed to generate test. Please try again.')
      setViewMode('form')
    } finally {
      setGenProgress(null)
    }
  }

  async function handleSubmit() {
    if (!activeQuestionSet) return
    isDirtyRef.current = false
    setViewMode('grading')
    setGradingProgress('Starting grading…')

    try {
      const answers = Object.entries(draftAnswers).map(([questionId, ans]) => ({
        question_id: questionId,
        selected_option_id: ans.selectedOptionId ?? null,
        response_text: ans.responseText ?? null,
      }))

      const question_order = (activeQuestions ?? []).map((q) => q.id)
      const option_orders: Record<string, string[]> = {}
      for (const q of activeQuestions ?? []) {
        if (q.questionType === 'mcq' && q.options) {
          option_orders[q.id] = q.options.map((o) => o.id)
        }
      }

      const res = await fetch(`${BACKEND_URL}/api/question-sets/${activeQuestionSet.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, question_order, option_orders }),
      })
      if (!res.ok) throw new Error(`Grading failed (${res.status})`)

      const event = await readSSE(res, setGradingProgress)
      const attempt = toAttemptDetail(event as Record<string, unknown>)
      setCurrentAttempt(attempt)
      setAttempts((prev) => [...prev, toAttempt(event as Record<string, unknown>)])
      setViewMode('review')
    } catch {
      setViewMode('taking')
    } finally {
      setGradingProgress(null)
    }
  }

  function handleRetake() {
    isDirtyRef.current = false
    setDraftAnswers({})
    setCurrentAttempt(null)
    setViewMode('taking')
  }

  async function handleRegenerate() {
    if (!activeTest) return
    if (!warnIfDirty()) return
    isDirtyRef.current = false
    setViewMode('generating')
    setGenProgress('Starting regeneration…')
    setGenError(null)

    try {
      const res = await fetch(`${BACKEND_URL}/api/tests/${activeTest.id}/question-sets`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Regeneration failed (${res.status})`)

      const event = await readSSE(res, setGenProgress)
      const newQs = toQuestionSet(event.question_set as Record<string, unknown>)
      const questions = toQuestions((event.questions as unknown[]) ?? [])

      onQuestionSetAdded(activeTest.id, newQs)
      setExpandedGroups((prev) => new Set([...prev, activeTest.id]))
      setActiveQuestionSet(newQs)
      setActiveQuestions(applyShuffleToQuestions(questions))
      setAttempts([])
      setDraftAnswers({})
      setCurrentAttempt(null)
      setViewMode('taking')
    } catch {
      setGenError('Regeneration failed. Please try again.')
      setViewMode('review')
    } finally {
      setGenProgress(null)
    }
  }

  async function handleAttemptSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const attemptId = e.target.value
    if (!activeQuestionSet || !attemptId) return
    const res = await fetch(`/api/question-sets/${activeQuestionSet.id}/attempts/${attemptId}`)
    if (res.ok) {
      const data = await res.json()
      setCurrentAttempt(toAttemptDetail(data))
      setViewMode('past_attempt')
    }
  }

  const showAttemptDropdown = activeQuestionSet !== null && (viewMode === 'review' || viewMode === 'past_attempt' || viewMode === 'taking') && attempts.length > 0

  return (
    <div className={styles.container}>
      {historyVisible && (
        <div className={styles.historyOverlay} onClick={() => setHistoryVisible(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.history} ${historyVisible ? styles.historyVisible : ''}`}>
        <div className={styles.historyHeader}>
          <span className={styles.historyLabel}>Tests</span>
          <button className={styles.historyCloseBtn} onClick={() => setHistoryVisible(false)}>
            <X size={16} />
          </button>
        </div>

        <button
          className={`${styles.newTestBtn} ${viewMode === 'form' ? styles.newTestBtnActive : ''}`}
          onClick={handleNewTest}
        >
          <Plus size={13} />
          New Test
        </button>

        <div className={styles.historyList}>
          {tests.length === 0 && <p className={styles.historyEmpty}>No tests yet.</p>}
          {tests.map((test) => {
            const multiSet = test.questionSets.length > 1
            const isExpanded = expandedGroups.has(test.id)
            const isTestActive = activeTest?.id === test.id

            if (!multiSet) {
              const qs = test.questionSets[0]
              return (
                <div
                  key={test.id}
                  className={`${styles.historyItem} ${isTestActive && !viewMode.startsWith('form') ? styles.historyItemActive : ''}`}
                >
                  <button
                    className={styles.historyItemBtn}
                    onClick={() => qs ? handleQuestionSetClick(test, qs) : undefined}
                  >
                    <ClipboardList
                      size={16}
                      color={isTestActive && !viewMode.startsWith('form') ? 'var(--primary)' : 'var(--on-surface-variant)'}
                    />
                    <div className={styles.historyItemMeta}>
                      <span className={styles.historyItemTitle}>{test.title}</span>
                    </div>
                  </button>
                  <button className={styles.historyDeleteBtn} onClick={(e) => handleDeleteTest(test, e)} aria-label="Delete test">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            }

            return (
              <div key={test.id} className={styles.historyGroup}>
                <div className={`${styles.historyItem} ${isTestActive && !viewMode.startsWith('form') ? styles.historyItemActive : ''}`}>
                  <button className={styles.historyItemBtn} onClick={() => toggleGroup(test.id)}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div className={styles.historyItemMeta}>
                      <span className={styles.historyItemTitle}>{test.title}</span>
                      <span className={styles.historyItemDate}>
                        {test.questionSets.length} question sets
                      </span>
                    </div>
                  </button>
                  <button className={styles.historyDeleteBtn} onClick={(e) => handleDeleteTest(test, e)} aria-label="Delete test">
                    <Trash2 size={12} />
                  </button>
                </div>

                {isExpanded && (
                  <div className={styles.historyGroupChildren}>
                    {test.questionSets.map((qs) => {
                      const isQsActive = activeQuestionSet?.id === qs.id
                      return (
                        <div
                          key={qs.id}
                          className={`${styles.historySubItem} ${isQsActive ? styles.historySubItemActive : ''}`}
                        >
                          <button
                            className={styles.historyItemBtn}
                            onClick={() => handleQuestionSetClick(test, qs)}
                          >
                            <div className={styles.historyItemMeta}>
                              <span className={styles.historyItemTitle}>{formatQsLabel(qs)}</span>
                            </div>
                          </button>
                          <button className={styles.historyDeleteBtn} onClick={(e) => handleDeleteQuestionSet(test, qs, e)} aria-label="Delete question set">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* Right panel */}
      <div className={styles.viewer}>
        <div className={styles.viewerTopBar}>
          <button className={styles.historyToggleBtn} onClick={() => setHistoryVisible(true)}>
            <Clock size={14} />
            History
          </button>
          {viewMode === 'form' && (
            <span className={styles.viewerModeLabel}><Plus size={14} /> New Test</span>
          )}
          {(viewMode === 'generating' || viewMode === 'grading') && activeTest && (
            <span className={styles.viewerModeLabel}>{activeTest.title}</span>
          )}
          {(viewMode === 'taking' || viewMode === 'review' || viewMode === 'past_attempt') && activeTest && (
            <span className={styles.viewerModeLabel}>{activeTest.title}</span>
          )}
          {showAttemptDropdown && (
            <select className={styles.attemptSelect} onChange={handleAttemptSelect} value="">
              <option value="" disabled>Attempt history</option>
              {attempts.map((a, i) => (
                <option key={a.id} value={a.id}>{formatAttemptLabel(a, i)}</option>
              ))}
            </select>
          )}
        </div>

        <div className={styles.docContent}>
          <div className={styles.docInner}>
            {viewMode === 'form' && (
              <TestForm
                selectedDocIds={selectedDocIds}
                sections={sections}
                mcqCount={mcqCount}
                frqCount={frqCount}
                purpose={purpose}
                generating={false}
                genError={genError}
                onMcqChange={setMcqCount}
                onFrqChange={setFrqCount}
                onPurposeChange={setPurpose}
                onGenerate={handleGenerate}
              />
            )}

            {(viewMode === 'generating' || viewMode === 'grading') && (
              <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinIcon} color="var(--primary)" />
                <p className={styles.loadingText}>
                  {viewMode === 'grading' ? (gradingProgress ?? 'Grading…') : (genProgress ?? 'Generating…')}
                </p>
              </div>
            )}

            {viewMode === 'taking' && activeQuestions && (
              <TestTaker
                questions={activeQuestions}
                draftAnswers={draftAnswers}
                onAnswerChange={(qId, ans) => setDraftAnswers((prev) => ({ ...prev, [qId]: ans }))}
                onSubmit={handleSubmit}
                submitting={false}
                onDirtyChange={(dirty) => { isDirtyRef.current = dirty }}
              />
            )}

            {(viewMode === 'review' || viewMode === 'past_attempt') && activeQuestions && currentAttempt && (
              <TestReview
                questions={activeQuestions}
                attempt={currentAttempt}
                onRetake={handleRetake}
                onRegenerate={handleRegenerate}
              />
            )}

            {viewMode === 'taking' && !activeQuestions && (
              <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinIcon} color="var(--primary)" />
                <p className={styles.loadingText}>Loading questions…</p>
              </div>
            )}

            {viewMode === 'form' && tests.length === 0 && (
              <div className={styles.emptyState}>
                <Sparkles size={40} color="var(--primary)" strokeWidth={1.5} />
                <p className={styles.emptyTitle}>Ready to test your knowledge</p>
                <p className={styles.emptyBody}>Configure and generate a test above.</p>
              </div>
            )}
          </div>
        </div>

        <footer className={styles.viewerFooter}>T(AI)</footer>
      </div>
    </div>
  )
}

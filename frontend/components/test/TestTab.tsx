'use client'

import { useRef, useState } from 'react'
import { ClipboardList, Clock, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import styles from './TestTab.module.css'
import TestForm from './TestForm'
import QuestionViewer from './QuestionViewer'
import type { Question, Section, Test, TestPurpose } from '@/types'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

interface TestTabProps {
  courseId: string
  courseTitle: string
  selectedDocIds: Set<string>
  sections: Section[]
  tests: Test[]
  onTestCreated: (test: Test) => void
  onTestDeleted: (testId: string) => void
}

function buildTestTitle(courseTitle: string): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${courseTitle} Test — ${date}`
}

function toTest(data: Record<string, unknown>): Test {
  return {
    id: data.id as string,
    courseId: data.course_id as string,
    title: data.title as string,
    sourceDocumentIds: (data.source_document_ids as string[]) ?? [],
    mcqCount: data.mcq_count as number,
    frqCount: data.frq_count as number,
    purpose: data.purpose as TestPurpose,
    createdAt: data.created_at as string,
  }
}

function toQuestions(raw: unknown[]): Question[] {
  return (raw ?? []).map((q) => {
    const qd = q as Record<string, unknown>
    const base = {
      id: qd.id as string,
      testId: qd.test_id as string,
      position: qd.position as number,
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
          position: o.position as number,
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

export default function TestTab({
  courseId,
  courseTitle,
  selectedDocIds,
  sections,
  tests,
  onTestCreated,
  onTestDeleted,
}: TestTabProps) {
  const navigatedAwayRef = useRef(false)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [activeTestQuestions, setActiveTestQuestions] = useState<Question[] | null>(null)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [newTestMode, setNewTestMode] = useState(false)

  // Form state
  const [mcqCount, setMcqCount] = useState(10)
  const [frqCount, setFrqCount] = useState(3)
  const [purpose, setPurpose] = useState<TestPurpose>('quick_review')

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  async function handleHistoryItemClick(test: Test) {
    if (generating) navigatedAwayRef.current = true
    setActiveTest(test)
    setActiveTestQuestions(null)
    setNewTestMode(false)
    setHistoryVisible(false)
    setLoadingQuestions(true)
    try {
      const res = await fetch(`/api/tests/${test.id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveTestQuestions(toQuestions(data.questions ?? []))
      }
    } finally {
      setLoadingQuestions(false)
    }
  }

  function handleNewTest() {
    navigatedAwayRef.current = false
    setNewTestMode(true)
    setActiveTest(null)
    setActiveTestQuestions(null)
    setHistoryVisible(false)
    setGenError(null)
  }

  async function handleDelete(test: Test) {
    await fetch(`/api/tests/${test.id}`, { method: 'DELETE' })
    onTestDeleted(test.id)
    if (activeTest?.id === test.id) {
      setActiveTest(null)
      setActiveTestQuestions(null)
      setNewTestMode(false)
    }
  }

  async function handleGenerate() {
    navigatedAwayRef.current = false
    setGenerating(true)
    setGenProgress('Preparing…')
    setGenError(null)

    try {
      const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_ids: sections
            .flatMap((s) => s.documents)
            .filter((d) => selectedDocIds.has(d.id) && d.ingestionStatus === 'complete')
            .map((d) => d.id),
          mcq_count: mcqCount,
          frq_count: frqCount,
          purpose,
          title: buildTestTitle(courseTitle),
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let created: Test | null = null
      let createdQuestions: Question[] | null = null

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw) as Record<string, unknown>
            if (event.type === 'progress') {
              setGenProgress(event.message as string)
            } else if (event.type === 'done') {
              created = toTest(event)
              createdQuestions = toQuestions((event.questions as unknown[]) ?? [])
            } else if (event.type === 'error') {
              throw new Error((event.message as string) ?? 'Unknown error')
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue
            throw err
          }
          if (created) break outer
        }
      }

      if (created && !navigatedAwayRef.current) {
        onTestCreated(created)
        setActiveTest(created)
        setActiveTestQuestions(createdQuestions)
        setNewTestMode(false)
      } else if (created) {
        onTestCreated(created)
      }
    } catch {
      setGenError('Failed to generate test. Please try again.')
    } finally {
      setGenerating(false)
      setGenProgress(null)
    }
  }

  const showForm = newTestMode && !generating
  const showGeneratingSpinner = generating && newTestMode
  const showEmpty = !newTestMode && activeTest === null
  const showTestView = !newTestMode && activeTest !== null

  return (
    <div className={styles.container}>
      {historyVisible && (
        <div className={styles.historyOverlay} onClick={() => setHistoryVisible(false)} />
      )}

      {/* Left panel */}
      <aside className={`${styles.history} ${historyVisible ? styles.historyVisible : ''}`}>
        <div className={styles.historyHeader}>
          <span className={styles.historyLabel}>Tests</span>
          <button className={styles.historyCloseBtn} onClick={() => setHistoryVisible(false)}>
            <X size={16} />
          </button>
        </div>

        <button
          className={`${styles.newTestBtn} ${newTestMode ? styles.newTestBtnActive : ''}`}
          onClick={handleNewTest}
        >
          <Plus size={13} />
          New Test
        </button>

        <div className={styles.historyList}>
          {tests.length === 0 && <p className={styles.historyEmpty}>No tests yet.</p>}
          {tests.map((item) => (
            <div
              key={item.id}
              className={`${styles.historyItem} ${activeTest?.id === item.id && !newTestMode ? styles.historyItemActive : ''}`}
            >
              <button className={styles.historyItemBtn} onClick={() => handleHistoryItemClick(item)}>
                <ClipboardList
                  size={16}
                  color={
                    activeTest?.id === item.id && !newTestMode
                      ? 'var(--primary)'
                      : 'var(--on-surface-variant)'
                  }
                />
                <div className={styles.historyItemMeta}>
                  <span className={styles.historyItemTitle}>{item.title}</span>
                  <span className={styles.historyItemDate}>
                    {new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </button>
              <button
                className={styles.historyDeleteBtn}
                onClick={() => handleDelete(item)}
                aria-label="Delete test"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Right panel */}
      <div className={styles.viewer}>
        <div className={styles.viewerTopBar}>
          <button className={styles.historyToggleBtn} onClick={() => setHistoryVisible(true)}>
            <Clock size={14} />
            History
          </button>
          {showForm && (
            <span className={styles.viewerModeLabel}>
              <Plus size={14} /> New Test
            </span>
          )}
          {showTestView && activeTest && (
            <span className={styles.viewerModeLabel}>{activeTest.title}</span>
          )}
        </div>

        <div className={styles.docContent}>
          <div className={styles.docInner}>
            {showEmpty && (
              <div className={styles.emptyState}>
                <Sparkles size={40} color="var(--primary)" strokeWidth={1.5} />
                <p className={styles.emptyTitle}>Ready to test your knowledge</p>
                <p className={styles.emptyBody}>
                  Click <strong>New Test</strong> to configure and generate a test.
                </p>
              </div>
            )}

            {showGeneratingSpinner && (
              <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinIcon} color="var(--primary)" />
                <p className={styles.loadingText}>{genProgress ?? 'Generating test…'}</p>
              </div>
            )}

            {showForm && (
              <TestForm
                selectedDocIds={selectedDocIds}
                sections={sections}
                mcqCount={mcqCount}
                frqCount={frqCount}
                purpose={purpose}
                generating={generating}
                genError={genError}
                onMcqChange={setMcqCount}
                onFrqChange={setFrqCount}
                onPurposeChange={setPurpose}
                onGenerate={handleGenerate}
              />
            )}

            {showTestView && (
              <QuestionViewer questions={activeTestQuestions} loading={loadingQuestions} />
            )}
          </div>
        </div>

        <footer className={styles.viewerFooter}>T(AI)</footer>
      </div>
    </div>
  )
}

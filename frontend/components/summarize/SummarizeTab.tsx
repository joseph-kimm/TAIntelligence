'use client'

import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Sparkles, Clock, X, Loader2, Trash2, Send } from 'lucide-react'
import styles from './SummarizeTab.module.css'
import type { Summary } from '@/types'

interface SummarizeTabProps {
  courseId: string
  selectedDocIds: Set<string>
  summaries: Summary[]
  isGenerating: boolean
  onGeneratingChange: (v: boolean) => void
  onSummaryCreated: (summary: Summary) => void
  onSummaryUpdated: (summary: Summary) => void
  onSummaryDeleted: (summaryId: string) => void
}

export default function SummarizeTab({
  courseId,
  selectedDocIds,
  summaries,
  isGenerating,
  onGeneratingChange,
  onSummaryCreated,
  onSummaryUpdated,
  onSummaryDeleted,
}: SummarizeTabProps) {
  const [historyVisible, setHistoryVisible] = useState(false)
  const [activeSummary, setActiveSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refineInput, setRefineInput] = useState('')
  const [refining, setRefining] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleSummarize() {
    if (selectedDocIds.size === 0 || isGenerating) return
    onGeneratingChange(true)
    setError(null)
    try {
      const res = await fetch(`/api/courses/${courseId}/summaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: [...selectedDocIds] }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const raw = await res.json()
      const summary = toSummary(raw)
      setActiveSummary(summary)
      onSummaryCreated(summary)
    } catch {
      setError('Failed to generate summary. Please try again.')
    } finally {
      onGeneratingChange(false)
    }
  }

  async function handleRefine() {
    if (!activeSummary || !refineInput.trim() || refining) return
    setRefining(true)
    const instruction = refineInput.trim()
    setRefineInput('')
    try {
      const res = await fetch(`/api/summaries/${activeSummary.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const raw = await res.json()
      const updated = toSummary(raw)
      setActiveSummary(updated)
      onSummaryUpdated(updated)
    } catch {
      setError('Failed to refine summary. Please try again.')
    } finally {
      setRefining(false)
    }
  }

  async function handleDelete(summary: Summary) {
    try {
      const res = await fetch(`/api/summaries/${summary.id}`, { method: 'DELETE' })
      if (!res.ok) return
      onSummaryDeleted(summary.id)
      if (activeSummary?.id === summary.id) setActiveSummary(null)
    } catch {
      // silently ignore
    }
  }

  function handleRefineKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRefine()
    }
  }

  const docCount = selectedDocIds.size
  const canSummarize = docCount > 0 && !isGenerating

  return (
    <div className={styles.container}>
      {historyVisible && (
        <div className={styles.historyOverlay} onClick={() => setHistoryVisible(false)} />
      )}

      {/* Left panel: history + summarize action + refine chatbox */}
      <aside className={`${styles.history} ${historyVisible ? styles.historyVisible : ''}`}>
        <div className={styles.historyHeader}>
          <span className={styles.historyLabel}>History</span>
          <button className={styles.historyCloseBtn} onClick={() => setHistoryVisible(false)}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.historyList}>
          {summaries.length === 0 && (
            <p className={styles.historyEmpty}>Summaries you generate will appear here.</p>
          )}
          {summaries.map((item) => (
            <div
              key={item.id}
              className={`${styles.historyItem} ${activeSummary?.id === item.id ? styles.historyItemActive : ''}`}
            >
              <button
                className={styles.historyItemBtn}
                onClick={() => { setActiveSummary(item); setHistoryVisible(false) }}
              >
                <div className={styles.historyItemHeader}>
                  <FileText
                    size={14}
                    color={activeSummary?.id === item.id ? 'var(--primary)' : 'var(--on-surface-variant)'}
                  />
                  <span className={styles.historyItemTitle}>{item.title}</span>
                </div>
                <p className={styles.historyItemPreview}>{item.content.slice(0, 160)}</p>
              </button>
              <button
                className={styles.historyDeleteBtn}
                onClick={() => handleDelete(item)}
                aria-label="Delete summary"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Summarize action area */}
        <div className={styles.summarizeAction}>
          <p className={styles.summarizeActionMeta}>
            {docCount === 0
              ? 'Select documents to summarize'
              : `${docCount} document${docCount > 1 ? 's' : ''} selected`}
          </p>
          <button
            className={styles.summarizeBtn}
            onClick={handleSummarize}
            disabled={!canSummarize}
          >
            {isGenerating
              ? <Loader2 size={16} className={styles.spinIcon} />
              : <Sparkles size={16} />
            }
            <span>{isGenerating ? 'Generating…' : 'Summarize'}</span>
          </button>
        </div>

        {/* Refinement chatbox */}
        <div className={styles.refineBox}>
          <p className={styles.refineLabel}>Refine active summary</p>
          <div className={styles.refineInputRow}>
            <textarea
              ref={textareaRef}
              className={styles.refineTextarea}
              placeholder={activeSummary ? 'e.g. make it shorter, add more detail on X…' : 'Open a summary to refine it'}
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={handleRefineKey}
              disabled={!activeSummary || refining}
              rows={3}
            />
            <button
              className={styles.refineSendBtn}
              onClick={handleRefine}
              disabled={!activeSummary || !refineInput.trim() || refining}
              aria-label="Send refinement"
            >
              {refining
                ? <Loader2 size={16} className={styles.spinIcon} />
                : <Send size={16} />
              }
            </button>
          </div>
        </div>
      </aside>

      {/* Right panel: summary viewer */}
      <div className={styles.viewer}>
        <div className={styles.viewerTopBar}>
          <div className={styles.viewerTopLeft}>
            <button
              className={styles.historyToggleBtn}
              onClick={() => setHistoryVisible(true)}
            >
              <Clock size={14} />
              History
            </button>

            <div className={styles.docInfo}>
              <div className={styles.docIcon}>
                {(isGenerating || refining)
                  ? <Loader2 size={20} color="var(--primary)" className={styles.spinIcon} />
                  : <FileText size={20} color="var(--primary)" />
                }
              </div>
              <div>
                <p className={styles.docName}>
                  {isGenerating
                    ? 'Generating summary…'
                    : refining
                      ? 'Refining…'
                      : activeSummary?.title ?? 'No summary selected'}
                </p>
                <p className={styles.docMeta}>
                  {isGenerating
                    ? `Analyzing ${docCount} document${docCount > 1 ? 's' : ''}…`
                    : activeSummary
                      ? `${activeSummary.sourceDocumentIds.length} source document${activeSummary.sourceDocumentIds.length > 1 ? 's' : ''}`
                      : 'Generate or select a summary from history'}
                </p>
              </div>
            </div>
          </div>

          {/* Mobile-only summarize button */}
          <button
            className={styles.summarizeBtnMobile}
            onClick={handleSummarize}
            disabled={!canSummarize}
            aria-label="Summarize"
          >
            {isGenerating
              ? <Loader2 size={18} className={styles.spinIcon} />
              : <Sparkles size={18} />
            }
          </button>
        </div>

        <div className={styles.docContent}>
          <div className={styles.docInner}>
            {(isGenerating || refining) && (
              <div className={styles.loadingState}>
                <Loader2 size={32} className={styles.spinIcon} color="var(--primary)" />
                <p className={styles.loadingText}>
                  {isGenerating ? 'Generating summary…' : 'Refining summary…'}
                </p>
              </div>
            )}

            {!isGenerating && !refining && error && (
              <p className={styles.errorText}>{error}</p>
            )}

            {!isGenerating && !refining && !error && activeSummary && (
              <>
                <h1 className={styles.docTitle}>{activeSummary.title}</h1>
                <div className={styles.summaryContent}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeSummary.content}
                  </ReactMarkdown>
                </div>
              </>
            )}

            {!isGenerating && !refining && !error && !activeSummary && (
              <div className={styles.emptyState}>
                <Sparkles size={40} color="var(--primary)" strokeWidth={1.5} />
                <p className={styles.emptyTitle}>Ready to summarize</p>
                <p className={styles.emptyBody}>
                  {docCount === 0
                    ? 'Select documents from the sidebar, then click Summarize.'
                    : `${docCount} document${docCount > 1 ? 's' : ''} selected — click Summarize in the panel.`}
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className={styles.viewerFooter}>T(AI)</footer>
      </div>
    </div>
  )
}

function toSummary(raw: Record<string, unknown>): Summary {
  return {
    id: raw.id as string,
    courseId: raw.course_id as string,
    documentId: (raw.document_id as string | null) ?? null,
    title: raw.title as string,
    content: raw.content as string,
    sourceDocumentIds: (raw.source_document_ids as string[]) ?? [],
    createdAt: raw.created_at as string,
  }
}

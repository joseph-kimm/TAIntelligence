'use client'

import { useState } from 'react'
import { FileText, Sparkles, Clock, X } from 'lucide-react'
import styles from './SummarizeTab.module.css'
import type { SummaryHistoryItem } from '@/types'

interface SummarizeTabProps {
  history: SummaryHistoryItem[]
  activeId: string | null
  documentTitle: string
  documentMeta: string
  documentContent: React.ReactNode
}

export default function SummarizeTab({
  history,
  activeId,
  documentTitle,
  documentMeta,
  documentContent,
}: SummarizeTabProps) {
  const [historyVisible, setHistoryVisible] = useState(false)

  return (
    <div className={styles.container}>
      {/* Mobile overlay behind history drawer */}
      {historyVisible && (
        <div className={styles.historyOverlay} onClick={() => setHistoryVisible(false)} />
      )}

      {/* History panel */}
      <aside className={`${styles.history} ${historyVisible ? styles.historyVisible : ''}`}>
        <div className={styles.historyHeader}>
          <span className={styles.historyLabel}>History</span>
          <button className={styles.historyCloseBtn} onClick={() => setHistoryVisible(false)}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.historyList}>
          {history.map((item) => (
            <button
              key={item.id}
              className={`${styles.historyItem} ${activeId === item.id ? styles.historyItemActive : ''}`}
            >
              <div className={styles.historyItemHeader}>
                <FileText size={14} color={activeId === item.id ? 'var(--primary)' : 'var(--on-surface-variant)'} />
                <span className={styles.historyItemTitle}>{item.title}</span>
              </div>
              <p className={styles.historyItemPreview}>{item.preview}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Document viewer */}
      <div className={styles.viewer}>
        <div className={styles.viewerTopBar}>
          <div className={styles.viewerTopLeft}>
            {/* Mobile: History toggle */}
            <button
              className={styles.historyToggleBtn}
              onClick={() => setHistoryVisible(true)}
            >
              <Clock size={14} />
              History
            </button>

            <div className={styles.docInfo}>
              <div className={styles.docIcon}>
                <FileText size={20} color="var(--primary)" />
              </div>
              <div>
                <p className={styles.docName}>{documentTitle}</p>
                <p className={styles.docMeta}>{documentMeta}</p>
              </div>
            </div>
          </div>

          <button className={styles.summarizeBtn}>
            <Sparkles size={18} />
            <span>Summarize</span>
          </button>
        </div>

        <div className={styles.docContent}>
          <div className={styles.docInner}>{documentContent}</div>
        </div>

        <footer className={styles.viewerFooter}>Course Helper v2.0</footer>
      </div>
    </div>
  )
}

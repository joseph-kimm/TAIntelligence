'use client'

import { Loader2, Sparkles } from 'lucide-react'
import SummaryOptionsPanel from './SummaryOptionsPanel'
import type { Document, SummaryOptions } from '@/types'
import styles from './NewSummaryPanel.module.css'

interface Props {
  selectedDocs: Document[]
  canGenerate: boolean
  isGenerating: boolean
  options: SummaryOptions
  onOptionsChange: (o: SummaryOptions) => void
  onGenerate: () => void
}

export default function NewSummaryPanel({
  selectedDocs,
  canGenerate,
  isGenerating,
  options,
  onOptionsChange,
  onGenerate,
}: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.top}>
        <Sparkles size={36} color="var(--primary)" strokeWidth={1.5} />
        <h2 className={styles.heading}>New Summary</h2>
        {selectedDocs.length === 0 ? (
          <p className={styles.meta}>Select documents from the sidebar first.</p>
        ) : (
          <div className={styles.selectedDocs}>
            {selectedDocs.map(d => (
              <span key={d.id} className={styles.selectedDoc}>{d.title}</span>
            ))}
          </div>
        )}
      </div>

      <SummaryOptionsPanel options={options} onChange={onOptionsChange} />

      <button className={styles.generateBtn} onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating
          ? <Loader2 size={16} className={styles.spinIcon} />
          : <Sparkles size={16} />
        }
        <span>{isGenerating ? 'Generating…' : 'Summarize'}</span>
      </button>
    </div>
  )
}

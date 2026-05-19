'use client'

import { Loader2, Minus, Plus, Sparkles } from 'lucide-react'
import styles from './TestTab.module.css'
import type { Section, TestPurpose } from '@/types'

interface TestFormProps {
  selectedDocIds: Set<string>
  sections: Section[]
  mcqCount: number
  frqCount: number
  purpose: TestPurpose
  generating: boolean
  genError: string | null
  onMcqChange: (n: number) => void
  onFrqChange: (n: number) => void
  onPurposeChange: (p: TestPurpose) => void
  onGenerate: () => void
}

const PURPOSE_OPTIONS: { value: TestPurpose; label: string; desc: string }[] = [
  { value: 'quick_review', label: 'Quick Review', desc: 'Recall of key terms and facts' },
  { value: 'exam_prep', label: 'Exam Prep', desc: 'Mixed depth, timed-test feel' },
  { value: 'deep_application', label: 'Deep Application', desc: 'Analysis and synthesis' },
]

export default function TestForm({
  selectedDocIds,
  sections,
  mcqCount,
  frqCount,
  purpose,
  generating,
  genError,
  onMcqChange,
  onFrqChange,
  onPurposeChange,
  onGenerate,
}: TestFormProps) {
  const selectedDocs = sections
    .flatMap((s) => s.documents)
    .filter((d) => selectedDocIds.has(d.id) && d.ingestionStatus === 'complete')

  const canGenerate = selectedDocs.length > 0 && mcqCount + frqCount > 0

  return (
    <div className={styles.formSections}>
      {/* Source documents */}
      <div className={styles.formSection}>
        <span className={styles.formLabel}>Source Documents</span>
        {selectedDocs.length === 0 ? (
          <p className={styles.noDocsHint}>Select documents from the sidebar first.</p>
        ) : (
          <div className={styles.selectedDocChips}>
            {selectedDocs.map((doc) => (
              <span key={doc.id} className={styles.selectedDocChip}>
                {doc.title}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Question counts */}
      <div className={styles.formSection}>
        <span className={styles.formLabel}>Question Count</span>
        <div className={styles.stepperControls}>
          <div className={styles.control}>
            <div className={styles.controlHeader}>
              <span className={styles.controlLabel}>Multiple Choice</span>
              <span className={styles.controlValue}>{mcqCount}</span>
            </div>
            <div className={styles.stepper}>
              <button
                className={styles.stepBtn}
                onClick={() => onMcqChange(Math.max(0, mcqCount - 1))}
              >
                <Minus size={14} />
              </button>
              <div className={styles.stepTrack}>
                <div className={styles.stepFill} style={{ width: `${(mcqCount / 20) * 100}%` }} />
              </div>
              <button
                className={styles.stepBtn}
                onClick={() => onMcqChange(Math.min(20, mcqCount + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className={styles.control}>
            <div className={styles.controlHeader}>
              <span className={styles.controlLabel}>Free Response</span>
              <span className={styles.controlValue}>{frqCount}</span>
            </div>
            <div className={styles.stepper}>
              <button
                className={styles.stepBtn}
                onClick={() => onFrqChange(Math.max(0, frqCount - 1))}
              >
                <Minus size={14} />
              </button>
              <div className={styles.stepTrack}>
                <div className={styles.stepFill} style={{ width: `${(frqCount / 10) * 100}%` }} />
              </div>
              <button
                className={styles.stepBtn}
                onClick={() => onFrqChange(Math.min(10, frqCount + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Purpose */}
      <div className={styles.formSection}>
        <span className={styles.formLabel}>Purpose</span>
        <div className={styles.purposeGrid}>
          {PURPOSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.purposeCard} ${purpose === opt.value ? styles.purposeCardActive : ''}`}
              onClick={() => onPurposeChange(opt.value)}
            >
              <p className={styles.purposeCardTitle}>{opt.label}</p>
              <p className={styles.purposeCardDesc}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generate */}
      <div className={styles.generateRow}>
        <button
          className={`${styles.generateBtn} ${canGenerate && !generating ? styles.generateBtnEnabled : ''}`}
          onClick={onGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? <Loader2 size={18} className={styles.spinIcon} /> : <Sparkles size={18} />}
          {generating ? 'Generating…' : 'Generate Test'}
        </button>
        {genError && <p className={styles.generateError}>{genError}</p>}
      </div>
    </div>
  )
}

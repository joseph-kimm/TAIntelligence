'use client'

import { useState } from 'react'
import { Sparkles, Minus, Plus } from 'lucide-react'
import styles from './TestTab.module.css'

interface TestConfig {
  mcq: number
  shortAnswer: number
  longAnswer: number
}

interface TestTabProps {
  config: TestConfig
}

export default function TestTab({ config }: TestTabProps) {
  const [mcq, setMcq] = useState(config.mcq)
  const [shortAnswer, setShortAnswer] = useState(config.shortAnswer)
  const [longAnswer, setLongAnswer] = useState(config.longAnswer)

  return (
    <div className={styles.container}>
      {/* Config */}
      <section className={styles.configGrid}>
        <div className={styles.configPanel}>
          <div className={styles.configHeader}>
            <span className={styles.configTitle}>Test Configuration</span>
            <span className={styles.activeBadge}>ACTIVE</span>
          </div>

          <div className={styles.configControls}>
            <div className={styles.control}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>Multiple Choice</span>
                <span className={styles.controlValue}>{mcq}</span>
              </div>
              <div className={styles.stepper}>
                <button className={styles.stepBtn} onClick={() => setMcq(Math.max(0, mcq - 1))}>
                  <Minus size={14} />
                </button>
                <div className={styles.stepTrack}>
                  <div className={styles.stepFill} style={{ width: `${(mcq / 20) * 100}%` }} />
                </div>
                <button className={styles.stepBtn} onClick={() => setMcq(Math.min(20, mcq + 1))}>
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className={styles.control}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>Short Answer</span>
                <span className={styles.controlValue}>{shortAnswer}</span>
              </div>
              <input
                className={styles.slider}
                type="range"
                min={0}
                max={20}
                value={shortAnswer}
                onChange={(e) => setShortAnswer(Number(e.target.value))}
              />
            </div>

            <div className={styles.control}>
              <div className={styles.controlHeader}>
                <span className={styles.controlLabel}>Long Answer</span>
                <span className={styles.controlValue}>{longAnswer}</span>
              </div>
              <div className={styles.stepper}>
                <button className={styles.stepBtn} onClick={() => setLongAnswer(Math.max(0, longAnswer - 1))}>
                  <Minus size={14} />
                </button>
                <div className={styles.stepTrack}>
                  <div className={styles.stepFill} style={{ width: `${(longAnswer / 10) * 100}%` }} />
                </div>
                <button className={styles.stepBtn} onClick={() => setLongAnswer(Math.min(10, longAnswer + 1))}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          <button className={styles.generateBtn}>
            <Sparkles size={18} />
            Generate Test
          </button>
        </div>

        <div className={styles.tipPanel}>
          <p className={styles.tipText}>
            <strong style={{ color: 'var(--primary)' }}>Pro-tip: </strong>
            Configuration prioritizes conceptual understanding over rote memorization.
          </p>
        </div>
      </section>

      {/* Preview */}
      <section className={styles.previewSection}>
        <div className={styles.previewHeader}>
          <h2 className={styles.previewTitle}>Sample Test Preview</h2>
          <span className={styles.draftBadge}>Draft</span>
        </div>

        <div className={styles.testDoc}>
          <div className={styles.testDocHeader}>
            <p className={styles.testDept}>Department of Architecture</p>
            <h3 className={styles.testName}>Modernism: Principles and Practice</h3>
            <p className={styles.testMode}>Standard Assessment Mode</p>
          </div>

          {/* MCQ question */}
          <div className={styles.question}>
            <div className={styles.questionTop}>
              <p className={styles.questionText}>
                <span className={styles.questionNum}>01.</span>
                Which architect is primarily associated with the phrase "less is more"?
              </p>
              <span className={styles.pointsBadge}>1 PT</span>
            </div>
            <div className={styles.options}>
              <label className={styles.optionLabel}>
                <div className={styles.radio} />
                Frank Lloyd Wright
              </label>
              <label className={styles.optionLabel}>
                <div className={`${styles.radio} ${styles.radioSelected}`}>
                  <div className={styles.radioDot} />
                </div>
                <strong>Ludwig Mies van der Rohe</strong>
              </label>
            </div>
          </div>

          {/* Short answer question */}
          <div className={styles.question}>
            <div className={styles.questionTop}>
              <p className={styles.questionText}>
                <span className={styles.questionNum}>02.</span>
                Briefly define the "Pilotis" in Le Corbusier's Five Points of Architecture.
              </p>
              <span className={styles.pointsBadge}>3 PTS</span>
            </div>
            <div className={styles.shortAnswerField}>Type your response here...</div>
          </div>

          <div className={styles.endOfPreview}>
            <div className={styles.endLine} />
            <span className={styles.endLabel}>End of Preview</span>
          </div>
        </div>
      </section>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './SummaryOptionsPanel.module.css'
import type { SummaryOptions, SummaryStyle, SummaryTone, FocusEmphasis, DetailLevel, AudienceLevel } from '@/types'

const DETAIL_STOPS = ['Default', 'TL;DR', 'Quick Read', 'Balanced', 'In-Depth', 'Exhaustive']
const AUDIENCE_STOPS = ['Default', 'ELI5', 'High School', 'College', 'Professional']

const STYLE_OPTIONS: { value: SummaryStyle; label: string }[] = [
  { value: 'bullet_points', label: 'Bullet Points' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'table', label: 'Table' },
  { value: 'structured', label: 'Structured' },
  { value: 'qa', label: 'Q&A' },
]

const TONE_OPTIONS: { value: SummaryTone; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'academic', label: 'Academic' },
  { value: 'conversational', label: 'Conversational' },
]

const FOCUS_OPTIONS: { value: FocusEmphasis; label: string }[] = [
  { value: 'concepts', label: 'Key Concepts' },
  { value: 'examples', label: 'Examples' },
  { value: 'arguments', label: 'Arguments' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'formulas', label: 'Formulas' },
]

export const DEFAULT_OPTIONS: SummaryOptions = {
  detailLevel: 0,
  lengthAuto: true,
  lengthMinutes: 5,
  audience: 0,
  style: null,
  tone: null,
  focusEmphasis: [],
}

interface Props {
  options: SummaryOptions
  onChange: (options: SummaryOptions) => void
}

export default function SummaryOptionsPanel({ options, onChange }: Props) {
  const [open, setOpen] = useState(false)

  function set(patch: Partial<SummaryOptions>) {
    onChange({ ...options, ...patch })
  }

  function toggleFocus(f: FocusEmphasis) {
    const next = options.focusEmphasis.includes(f)
      ? options.focusEmphasis.filter(x => x !== f)
      : [...options.focusEmphasis, f]
    set({ focusEmphasis: next })
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen(o => !o)}>
        <ChevronDown size={13} className={open ? styles.chevronUp : ''} />
        Advanced options
      </button>

      {open && (
        <div className={styles.panel}>

          {/* Level of Detail */}
          <div className={styles.group}>
            <div className={styles.labelRow}>
              <span className={styles.label}>Level of Detail</span>
              <span className={styles.sliderValue}>{DETAIL_STOPS[options.detailLevel]}</span>
            </div>
            <input
              type="range"
              min={0} max={5} step={1}
              value={options.detailLevel}
              onChange={e => set({ detailLevel: Number(e.target.value) as DetailLevel })}
              className={styles.slider}
            />
          </div>

          {/* Length */}
          <div className={styles.group}>
            <div className={styles.labelRow}>
              <span className={styles.label}>Length</span>
              <label className={styles.autoLabel}>
                <input
                  type="checkbox"
                  checked={options.lengthAuto}
                  onChange={e => set({ lengthAuto: e.target.checked })}
                />
                Auto
              </label>
            </div>
            <input
              type="range"
              min={1} max={20} step={1}
              value={options.lengthMinutes}
              disabled={options.lengthAuto}
              onChange={e => set({ lengthMinutes: Number(e.target.value) })}
              className={styles.slider}
            />
            {!options.lengthAuto && (
              <span className={styles.sliderValue}>{options.lengthMinutes} min read</span>
            )}
          </div>

          {/* Audience */}
          <div className={styles.group}>
            <div className={styles.labelRow}>
              <span className={styles.label}>Audience</span>
              <span className={styles.sliderValue}>{AUDIENCE_STOPS[options.audience]}</span>
            </div>
            <input
              type="range"
              min={0} max={4} step={1}
              value={options.audience}
              onChange={e => set({ audience: Number(e.target.value) as AudienceLevel })}
              className={styles.slider}
            />
          </div>

          {/* Style */}
          <div className={styles.group}>
            <span className={styles.label}>Style</span>
            <div className={styles.chips}>
              {STYLE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  className={`${styles.chip} ${options.style === value ? styles.chipActive : ''}`}
                  onClick={() => set({ style: options.style === value ? null : value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className={styles.group}>
            <span className={styles.label}>Tone</span>
            <div className={styles.chips}>
              {TONE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  className={`${styles.chip} ${options.tone === value ? styles.chipActive : ''}`}
                  onClick={() => set({ tone: options.tone === value ? null : value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Focus Emphasis */}
          <div className={styles.group}>
            <span className={styles.label}>Focus</span>
            <div className={styles.chips}>
              {FOCUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  className={`${styles.chip} ${options.focusEmphasis.includes(value) ? styles.chipActive : ''}`}
                  onClick={() => toggleFocus(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

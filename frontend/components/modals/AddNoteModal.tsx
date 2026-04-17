'use client'

import { useState } from 'react'
import { Upload, Link, HardDrive, ClipboardPaste, ChevronDown } from 'lucide-react'
import styles from './AddNoteModal.module.css'
import type { Section } from '@/types'

interface AddDocumentModalProps {
  sections: Section[]
  onClose: () => void
  onCreate: (name: string, sectionId: string) => void
}

export default function AddNoteModal({ sections, onClose, onCreate }: AddDocumentModalProps) {
  const [name, setName] = useState('')
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')

  function handleCreate() {
    if (!name.trim()) return
    onCreate(name.trim(), sectionId)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.modalTitle}>Add New Document</h3>
          <p className={styles.modalSubtitle}>Upload a document to this section.</p>
        </div>

        <div className={styles.body}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="doc-name">Document Name</label>
              <input
                id="doc-name"
                className={styles.input}
                placeholder="e.g. Bauhaus Philosophy Summary"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="section-select">Section</label>
              <div className={styles.selectWrap}>
                <select
                  id="section-select"
                  className={styles.select}
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                  <option value="new">+ Add New Section</option>
                </select>
                <ChevronDown size={18} className={styles.selectChevron} />
              </div>
            </div>
          </div>

          <div className={styles.dropZone}>
            <p className={styles.dropLabel}>or drop your files</p>
            <p className={styles.dropSub}>pdf, images, docs, audio, and <u>more</u></p>
            <div className={styles.uploadButtons}>
              <button className={styles.uploadBtn}><Upload size={18} /> Upload files</button>
              <button className={styles.uploadBtn}><Link size={18} /> Websites</button>
              <button className={styles.uploadBtn}><HardDrive size={18} /> Drive</button>
              <button className={styles.uploadBtn}><ClipboardPaste size={18} /> Copied text</button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate}>Add Document</button>
        </div>
      </div>
    </div>
  )
}

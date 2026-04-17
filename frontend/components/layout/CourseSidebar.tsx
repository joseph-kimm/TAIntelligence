'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Square, CheckSquare, Minus, Folder, FileText, MoreVertical, Plus, ChevronLeft, X } from 'lucide-react'
import styles from './CourseSidebar.module.css'
import type { Section } from '@/types'

interface CourseSidebarProps {
  title: string
  sections: Section[]
  onAddDocument: () => void
  isOpen?: boolean
  onClose?: () => void
}

export default function CourseSidebar({ title, sections, onAddDocument, isOpen = false, onClose }: CourseSidebarProps) {
  const router = useRouter()

  const allDocumentIds = useMemo(
    () => sections.flatMap((s) => s.documents.map((d) => d.id)),
    [sections]
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = selected.size === allDocumentIds.length && allDocumentIds.length > 0
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allDocumentIds))
  }

  function toggleDocument(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSection(section: Section) {
    const ids = section.documents.map((d) => d.id)
    const allChecked = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      allChecked ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id))
      return next
    })
  }

  function sectionState(section: Section): 'all' | 'some' | 'none' {
    const ids = section.documents.map((d) => d.id)
    const count = ids.filter((id) => selected.has(id)).length
    if (count === ids.length && ids.length > 0) return 'all'
    if (count > 0) return 'some'
    return 'none'
  }

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        onClick={onClose}
      />

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        {/* Mobile close button */}
        <div className={styles.closeBtn}>
          <button onClick={onClose} aria-label="Close sidebar">
            <X size={20} color="var(--on-surface-variant)" />
          </button>
        </div>

        <div className={styles.titleBlock}>
          <button className={styles.backBtn} onClick={() => router.push('/')}>
            <ChevronLeft size={16} />
            My Courses
          </button>
          <h1 className={styles.title}>{title}</h1>
        </div>

        <p className={styles.sectionLabel}>Course Materials</p>

        <nav className={styles.nav}>
          <button className={styles.selectAll} onClick={toggleAll}>
            <span className={styles.selectAllInner}>
              {allSelected ? <CheckSquare size={20} /> : someSelected ? <Minus size={20} /> : <Square size={20} />}
              <span>Select All</span>
            </span>
          </button>

          {sections.map((section, i) => {
            const state = sectionState(section)
            return (
              <div key={section.id} className={styles.chapter}>
                <div className={styles.chapterRow}>
                  <div className={styles.rowLeft}>
                    <button className={styles.checkBtn} onClick={() => toggleSection(section)}>
                      {state === 'all' ? <CheckSquare size={20} color="var(--primary)" />
                        : state === 'some' ? <Minus size={20} color="var(--primary)" />
                        : <Square size={20} />}
                    </button>
                    <div className={styles.rowLabel}>
                      <Folder size={18} />
                      <span className={styles.chapterTitle}>{section.title}</span>
                    </div>
                  </div>
                  <MoreVertical size={14} />
                </div>

                <div className={styles.noteList}>
                  {section.documents.map((doc) => (
                    <div key={doc.id} className={styles.noteRow}>
                      <div className={styles.rowLeft}>
                        <button className={styles.checkBtn} onClick={() => toggleDocument(doc.id)}>
                          {selected.has(doc.id)
                            ? <CheckSquare size={18} color="var(--primary)" />
                            : <Square size={18} />}
                        </button>
                        <div className={styles.rowLabel}>
                          <FileText size={18} />
                          <span className={styles.noteTitle}>{doc.title}</span>
                        </div>
                      </div>
                      <MoreVertical size={12} />
                    </div>
                  ))}
                </div>

                {i < sections.length - 1 && <hr className={styles.divider} />}
              </div>
            )
          })}
        </nav>

        <button className={styles.addButton} onClick={onAddDocument}>
          <Plus size={20} />
          Add Document
        </button>
      </aside>
    </>
  )
}

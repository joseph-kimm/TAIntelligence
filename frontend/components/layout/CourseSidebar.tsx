'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Square, CheckSquare, Minus, Folder, FileText, MoreVertical, Plus, ChevronLeft, X } from 'lucide-react'
import styles from './CourseSidebar.module.css'
import { renameSection, deleteSection, renameDocument, deleteDocument } from '@/lib/actions/courses'
import type { Section } from '@/types'

interface CourseSidebarProps {
  title: string
  sections: Section[]
  onAddDocument: () => void
  isOpen?: boolean
  onClose?: () => void
}

type MenuTarget = { type: 'section' | 'document'; id: string }

export default function CourseSidebar({ title, sections, onAddDocument, isOpen = false, onClose }: CourseSidebarProps) {
  const router = useRouter()

  const allDocumentIds = useMemo(
    () => sections.flatMap((s) => s.documents.map((d) => d.id)),
    [sections]
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Menu state
  const [openMenu, setOpenMenu] = useState<MenuTarget | null>(null)
  const [confirming, setConfirming] = useState<MenuTarget | null>(null)
  const [renaming, setRenaming] = useState<MenuTarget | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const allSelected = selected.size === allDocumentIds.length && allDocumentIds.length > 0
  const someSelected = selected.size > 0 && !allSelected

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
        setConfirming(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  // Focus rename input when it opens
  useEffect(() => {
    if (renaming) renameInputRef.current?.select()
  }, [renaming])

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

  function openMenuFor(target: MenuTarget, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation()
    setOpenMenu(target)
    setConfirming(null)
    setRenameValue(currentTitle)
  }

  function startRename(target: MenuTarget, currentTitle: string) {
    setOpenMenu(null)
    setRenaming(target)
    setRenameValue(currentTitle)
  }

  async function commitRename() {
    if (!renaming) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      if (renaming.type === 'section') await renameSection(renaming.id, trimmed)
      else await renameDocument(renaming.id, trimmed)
      router.refresh()
    }
    setRenaming(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenaming(null)
  }

  async function commitDelete(target: MenuTarget) {
    if (target.type === 'section') await deleteSection(target.id)
    else await deleteDocument(target.id)
    setOpenMenu(null)
    setConfirming(null)
    router.refresh()
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
            const sectionTarget: MenuTarget = { type: 'section', id: section.id }
            const isSectionMenuOpen = openMenu?.id === section.id && openMenu?.type === 'section'
            const isSectionConfirming = confirming?.id === section.id && confirming?.type === 'section'
            const isRenamingSection = renaming?.id === section.id && renaming?.type === 'section'

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
                      {isRenamingSection ? (
                        <input
                          ref={renameInputRef}
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={handleRenameKeyDown}
                          onBlur={commitRename}
                        />
                      ) : (
                        <span className={styles.chapterTitle}>{section.title}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.menuWrapper} ref={isSectionMenuOpen ? menuRef : undefined}>
                    <button
                      className={styles.moreBtn}
                      onClick={(e) => openMenuFor(sectionTarget, section.title, e)}
                      aria-label="Section options"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {isSectionMenuOpen && (
                      <div className={styles.dropdown}>
                        {isSectionConfirming ? (
                          <div className={styles.confirmRow}>
                            <span className={styles.confirmLabel}>Delete section?</span>
                            <div className={styles.confirmBtns}>
                              <button className={styles.confirmYes} onClick={() => commitDelete(sectionTarget)}>Delete</button>
                              <button className={styles.confirmNo} onClick={() => setConfirming(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button className={styles.dropdownItem} onClick={() => startRename(sectionTarget, section.title)}>Rename</button>
                            <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={() => setConfirming(sectionTarget)}>Delete</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.noteList}>
                  {section.documents.map((doc) => {
                    const docTarget: MenuTarget = { type: 'document', id: doc.id }
                    const isDocMenuOpen = openMenu?.id === doc.id && openMenu?.type === 'document'
                    const isDocConfirming = confirming?.id === doc.id && confirming?.type === 'document'
                    const isRenamingDoc = renaming?.id === doc.id && renaming?.type === 'document'

                    return (
                      <div key={doc.id} className={styles.noteRow}>
                        <div className={styles.rowLeft}>
                          <button className={styles.checkBtn} onClick={() => toggleDocument(doc.id)}>
                            {selected.has(doc.id)
                              ? <CheckSquare size={18} color="var(--primary)" />
                              : <Square size={18} />}
                          </button>
                          <div className={styles.rowLabel}>
                            <FileText size={18} />
                            {isRenamingDoc ? (
                              <input
                                ref={renameInputRef}
                                className={styles.renameInput}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={handleRenameKeyDown}
                                onBlur={commitRename}
                              />
                            ) : (
                              <span className={styles.noteTitle}>{doc.title}</span>
                            )}
                          </div>
                        </div>

                        <div className={styles.menuWrapper} ref={isDocMenuOpen ? menuRef : undefined}>
                          <button
                            className={styles.moreBtn}
                            onClick={(e) => openMenuFor(docTarget, doc.title, e)}
                            aria-label="Document options"
                          >
                            <MoreVertical size={12} />
                          </button>
                          {isDocMenuOpen && (
                            <div className={styles.dropdown}>
                              {isDocConfirming ? (
                                <div className={styles.confirmRow}>
                                  <span className={styles.confirmLabel}>Delete document?</span>
                                  <div className={styles.confirmBtns}>
                                    <button className={styles.confirmYes} onClick={() => commitDelete(docTarget)}>Delete</button>
                                    <button className={styles.confirmNo} onClick={() => setConfirming(null)}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button className={styles.dropdownItem} onClick={() => startRename(docTarget, doc.title)}>Rename</button>
                                  <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={() => setConfirming(docTarget)}>Delete</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
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

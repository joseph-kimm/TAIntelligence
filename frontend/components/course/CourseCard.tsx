'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Plus } from 'lucide-react'
import styles from './CourseCard.module.css'
import { renameCourse, deleteCourse } from '@/lib/actions/courses'
import type { Course } from '@/types'

interface CourseCardProps {
  course: Course
  href: string
}

const BAND_PALETTES = [
  { bg: '#c1eeba', text: '#345a32' }, // green
  { bg: '#bbd6f5', text: '#1d4170' }, // blue
  { bg: '#e0d0f5', text: '#4a3280' }, // purple
  { bg: '#fde8c8', text: '#7a3d10' }, // orange
  { bg: '#f5d0dc', text: '#7a2040' }, // rose
  { bg: '#c0ece8', text: '#1d504e' }, // teal
  { bg: '#fdf0bb', text: '#6b5a10' }, // yellow
]

function bandPalette(id: string) {
  const hash = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  return BAND_PALETTES[hash % BAND_PALETTES.length]
}

export function CourseCard({ course, href }: CourseCardProps) {
  const router = useRouter()
  const palette = bandPalette(course.id)

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(course.title)
  const [displayTitle, setDisplayTitle] = useState(course.title)

  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Focus input when rename mode starts
  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  function openMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen((v) => !v)
    setConfirming(false)
  }

  async function handleRename() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === displayTitle) {
      setRenaming(false)
      setNameValue(displayTitle)
      return
    }
    setDisplayTitle(trimmed)
    setRenaming(false)
    await renameCourse(course.id, trimmed)
    router.refresh()
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleRename()
    if (e.key === 'Escape') {
      setRenaming(false)
      setNameValue(displayTitle)
    }
  }

  async function handleDelete() {
    await deleteCourse(course.id)
    router.refresh()
  }

  const initial = displayTitle.charAt(0).toUpperCase()

  return (
    <div className={styles.cardWrapper} style={{ background: palette.bg }}>
      <Link href={href} className={styles.card}>
        <span className={styles.initial} style={{ color: palette.text }}>{initial}</span>
        <div className={styles.meta} style={{ color: palette.text }}>
          {renaming ? (
            <input
              ref={inputRef}
              className={styles.renameInput}
              style={{ color: palette.text, borderColor: palette.text }}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRename}
              onClick={(e) => e.preventDefault()}
            />
          ) : (
            <h3 className={styles.cardTitle}>{displayTitle}</h3>
          )}
          <span className={styles.date}>{course.updatedAt}</span>
        </div>
      </Link>

      <div className={styles.menuWrapper} ref={menuRef}>
        <button
          className={styles.menuBtn}
          style={{ color: palette.text }}
          onClick={openMenu}
          aria-label="Course options"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div className={styles.dropdown}>
            {confirming ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Delete course?</span>
                <div className={styles.confirmBtns}>
                  <button className={styles.confirmYes} onClick={handleDelete}>Delete</button>
                  <button className={styles.confirmNo} onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button
                  className={styles.dropdownItem}
                  onClick={() => { setMenuOpen(false); setRenaming(true) }}
                >
                  Rename
                </button>
                <button
                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function CreateCourseCard({ onClick }: { onClick: () => void }) {
  return (
    <button className={styles.createCard} onClick={onClick}>
      <div className={styles.createIcon}>
        <Plus size={22} color="var(--primary)" />
      </div>
      <span className={styles.createLabel}>Create new course</span>
    </button>
  )
}

'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCourse } from '@/lib/actions/courses'
import styles from './CreateCourseModal.module.css'

interface CreateCourseModalProps {
  onClose: () => void
}

export default function CreateCourseModal({ onClose }: CreateCourseModalProps) {
  const [title, setTitle] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    startTransition(async () => {
      await createCourse(trimmed)
      router.refresh()
      onClose()
    })
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title" className={styles.title}>New course</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            autoFocus
            className={styles.input}
            type="text"
            placeholder="Course name"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            disabled={isPending}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.create}
              disabled={!title.trim() || isPending}
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

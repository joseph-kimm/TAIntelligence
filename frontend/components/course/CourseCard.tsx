'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import styles from './CourseCard.module.css'
import type { Course } from '@/types'

interface CourseCardProps {
  course: Course
  href: string
}

export function CourseCard({ course, href }: CourseCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.meta}>
        <h3 className={styles.cardTitle}>{course.title}</h3>
        <span className={styles.date}>{course.updatedAt}</span>
      </div>
    </Link>
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

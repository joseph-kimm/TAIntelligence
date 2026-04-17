import { notFound } from 'next/navigation'
import { getCourse, getCourseSections } from '@/lib/courses'
import CoursePageClient from './CoursePageClient'

// params is a Promise in Next.js 16 — must be awaited before accessing values.
export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Fetch course and sections at the same time to avoid waterfall requests.
  // (Waterfall = fetch A, wait, then fetch B — parallel is faster.)
  const [course, sections] = await Promise.all([
    getCourse(id),
    getCourseSections(id),
  ])

  // getCourse returns null when the backend responds with 404.
  // notFound() renders the nearest not-found.tsx, or Next.js's default 404 page.
  if (!course) notFound()

  return <CoursePageClient course={course} sections={sections} />
}

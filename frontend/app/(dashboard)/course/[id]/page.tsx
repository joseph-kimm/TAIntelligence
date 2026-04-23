import { notFound } from 'next/navigation'
import { getCourse, getCourseSections, getChats } from '@/lib/queries'
import CoursePageClient from './CoursePageClient'

// params is a Promise in Next.js 16 — must be awaited before accessing values.
export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [course, sections, chats] = await Promise.all([
    getCourse(id),
    getCourseSections(id),
    getChats(id),
  ])

  if (!course) notFound()

  return <CoursePageClient course={course} sections={sections} initialChats={chats} />
}

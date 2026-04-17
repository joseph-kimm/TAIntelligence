import { Settings } from 'lucide-react'
import { getCourses } from '@/lib/courses'
import CourseGrid from './CourseGrid'
import styles from './page.module.css'

// Server Component — fetches courses and passes them to the Client Component grid.
// No functions are passed as props, only plain serializable data (the courses array).
export default async function HomePage() {
  const courses = await getCourses()

  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>My Courses</h1>
        </header>
        <CourseGrid courses={courses} />
      </main>

      <nav className={styles.bottomNav}>
        <button className={styles.settingsBtn}>
          <Settings size={20} />
          Settings
        </button>
      </nav>
    </>
  )
}

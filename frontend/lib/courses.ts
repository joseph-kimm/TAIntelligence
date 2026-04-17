import { apiFetch, ApiError } from '@/lib/api'
import type { Course, Section } from '@/types'

// Returns all courses ordered by most recently updated.
export async function getCourses(): Promise<Course[]> {
  return apiFetch<Course[]>('/api/courses')
}

// Returns a single course, or null if it doesn't exist (404).
// Any other error (500, network failure, etc.) is re-thrown.
export async function getCourse(id: string): Promise<Course | null> {
  try {
    return await apiFetch<Course>(`/api/courses/${id}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

// Returns all sections for a course, each with documents nested inside.
export async function getCourseSections(id: string): Promise<Section[]> {
  return apiFetch<Section[]>(`/api/courses/${id}/sections`)
}

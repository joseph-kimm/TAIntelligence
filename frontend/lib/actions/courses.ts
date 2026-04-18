'use server'

import { apiFetch } from '@/lib/api'
import type { Course, Document, Section } from '@/types'

export async function createCourse(title: string): Promise<Course> {
  return apiFetch<Course>('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function renameCourse(id: string, title: string): Promise<Course> {
  return apiFetch<Course>(`/api/courses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function deleteCourse(id: string): Promise<void> {
  await apiFetch<void>(`/api/courses/${id}`, { method: 'DELETE' })
}

export async function renameSection(id: string, title: string): Promise<void> {
  await apiFetch<void>(`/api/sections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function deleteSection(id: string): Promise<void> {
  await apiFetch<void>(`/api/sections/${id}`, { method: 'DELETE' })
}

export async function renameDocument(id: string, title: string): Promise<void> {
  await apiFetch<void>(`/api/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch<void>(`/api/documents/${id}`, { method: 'DELETE' })
}

export async function createSection(courseId: string, title: string): Promise<Section> {
  return apiFetch<Section>('/api/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id: courseId, title }),
  })
}

export async function createDocument(formData: FormData): Promise<Document> {
  // No Content-Type header — fetch sets it automatically with the multipart boundary.
  return apiFetch<Document>('/api/documents', {
    method: 'POST',
    body: formData,
  })
}

'use server'

import { apiFetch } from '@/lib/api'
import type { Chat, Course, Section } from '@/types'

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

export async function createSection(courseId: string, title: string): Promise<Section> {
  return apiFetch<Section>('/api/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course_id: courseId, title }),
  })
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

export async function createChat(courseId: string): Promise<Chat> {
  return apiFetch<Chat>(`/api/courses/${courseId}/chats`, { method: 'POST' })
}

export async function deleteChat(chatId: string): Promise<void> {
  await apiFetch<void>(`/api/chats/${chatId}`, { method: 'DELETE' })
}

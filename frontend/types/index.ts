export interface Course {
  id: string
  title: string
  updatedAt: string
}

export interface Section {
  id: string
  title: string
  documents: Document[]
}

export interface Document {
  id: string
  title: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  chunkIds: string[]
}

export interface Chat {
  id: string
  courseId: string
  createdAt: string
  messages: Message[]
}

export interface SummaryHistoryItem {
  id: string
  title: string
  preview: string
}

export type CourseTab = 'chat' | 'summarize' | 'test'

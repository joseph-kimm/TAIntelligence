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
  ingestionStatus: 'pending' | 'complete' | 'failed'
}

export interface ChunkCitation {
  id: string
  text: string
  documentTitle: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  chunkIds: string[]
  citations?: ChunkCitation[]
  isError?: boolean
}

export interface Chat {
  id: string
  courseId: string
  createdAt: string
  messages: Message[]
}

export interface Summary {
  id: string
  courseId: string
  title: string
  content: string
  currentVersionNumber: number
  sourceDocumentIds: string[]
  createdAt: string
}

export type EditType = 'structure' | 'content' | 'initial'

export interface SummaryVersion {
  id: string
  summaryId: string
  versionNumber: number
  editType: EditType
  createdAt: string
}

export interface SummaryVersionDetail extends SummaryVersion {
  content: string
}


export type CourseTab = 'chat' | 'summarize' | 'test'

export type TestPurpose = 'quick_review' | 'exam_prep' | 'deep_application'

export interface Test {
  id: string
  courseId: string
  title: string
  sourceDocumentIds: string[]
  mcqCount: number
  frqCount: number
  purpose: TestPurpose
  createdAt: string
  questions?: Question[]
}

export interface McqOption {
  id: string
  questionId: string
  position: number
  content: string
  isCorrect: boolean
  explanation: string | null
}

export interface FrqAnswer {
  id: string
  questionId: string
  idealAnswer: string | null
  rubric: Array<{ criterion: string; points: number }>
}

export interface Question {
  id: string
  testId: string
  position: number
  questionType: 'mcq' | 'frq'
  content: string
  learningObjective: string | null
  options?: McqOption[]
  answer?: FrqAnswer
}

export type DetailLevel = 0 | 1 | 2 | 3 | 4 | 5
export type AudienceLevel = 0 | 1 | 2 | 3 | 4
export type SummaryStyle = 'bullet_points' | 'paragraph' | 'table' | 'structured' | 'qa'
export type SummaryTone = 'neutral' | 'academic' | 'conversational'
export type FocusEmphasis = 'concepts' | 'examples' | 'arguments' | 'timeline' | 'formulas'

export interface SummaryOptions {
  detailLevel: DetailLevel
  lengthAuto: boolean
  lengthMinutes: number
  audience: AudienceLevel
  style: SummaryStyle | null
  tone: SummaryTone | null
  focusEmphasis: FocusEmphasis[]
}

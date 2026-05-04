import type { ChunkCitation, Message } from '@/types'

// Shape of the message object returned by the backend (superset of Message).
interface BackendMessage {
  id: string
  chatId: string
  role: 'user' | 'assistant'
  content: string
  chunkIds: string[]
  createdAt: string
}

export type SseEvent =
  | { type: 'user_message'; message: BackendMessage }
  | { type: 'delta'; content: string }
  | { type: 'done'; message: BackendMessage; citations?: ChunkCitation[] }
  | { type: 'error'; message: string }

/** Convert a BackendMessage to the frontend Message shape. */
export function toMessage(m: BackendMessage, citations?: ChunkCitation[]): Message {
  return { id: m.id, role: m.role, content: m.content, chunkIds: m.chunkIds, citations }
}

/**
 * Async generator that reads an SSE stream and yields parsed events.
 * Each event is a `data: <json>` line from the server.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data) continue
        try {
          yield JSON.parse(data) as SseEvent
        } catch {
          // skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

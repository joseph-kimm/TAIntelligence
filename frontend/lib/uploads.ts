import type { Document } from '@/types'

// Uses NEXT_PUBLIC_ prefix so it's available in the browser (client components).
// Server-side calls use BACKEND_URL in lib/api.ts instead.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

// Upload a document (file or website URL) directly from the browser to the
// FastAPI backend, bypassing Next.js so there's no server-side body size limit.
export async function uploadDocument(formData: FormData): Promise<Document> {
  const res = await fetch(`${BACKEND_URL}/api/documents`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail ?? `Upload failed (${res.status})`)
  }

  return res.json() as Promise<Document>
}

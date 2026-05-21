import type { Document } from '@/types'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000'

export async function reserveDocument(params: {
  section_id: string
  title: string
  content_type: string
}): Promise<{ document: Document; upload_url: string }> {
  const res = await fetch(`${BACKEND_URL}/api/documents/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail ?? `Reservation failed (${res.status})`)
  }
  return res.json()
}

export function uploadToR2WithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('R2 upload failed'))
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}

export async function triggerIngestion(documentId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/documents/${documentId}/ingest`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail ?? `Ingest trigger failed (${res.status})`)
  }
}

export async function uploadWebsiteDocument(formData: FormData): Promise<Document> {
  const res = await fetch(`${BACKEND_URL}/api/documents`, { method: 'POST', body: formData })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail ?? `Upload failed (${res.status})`)
  }
  return res.json() as Promise<Document>
}

// Base URL is read server-side from the environment.
// No NEXT_PUBLIC_ prefix — this is only called from Server Components,
// never from the browser.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

// Custom error class so callers can check the HTTP status code.
// e.g. if (err instanceof ApiError && err.status === 404) { ... }
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Generic fetch wrapper — all API calls go through here.
// cache: 'no-store' ensures we always get fresh data (Next.js 16 default,
// but explicit is clearer).
export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { cache: 'no-store' })

  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status} on ${path}`)
  }

  return res.json() as Promise<T>
}

import type { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/documents/[documentId]/ingestion-status'>,
) {
  const { documentId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/documents/${documentId}/ingestion-status`)
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

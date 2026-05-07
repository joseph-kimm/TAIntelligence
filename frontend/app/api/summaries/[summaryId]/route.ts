import type { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/summaries/[summaryId]'>,
) {
  const { summaryId } = await ctx.params
  const body = await request.text()
  const res = await fetch(`${BACKEND_URL}/api/summaries/${summaryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await res.text()
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/summaries/[summaryId]'>,
) {
  const { summaryId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/summaries/${summaryId}`, { method: 'DELETE' })
  return new Response(null, { status: res.status })
}

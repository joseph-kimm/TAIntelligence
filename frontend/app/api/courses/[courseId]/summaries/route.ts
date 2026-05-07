import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/courses/[courseId]/summaries'>,
) {
  const { courseId } = await ctx.params
  const body = await request.text()
  const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await res.text()
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/courses/[courseId]/summaries'>,
) {
  const { courseId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/summaries`)
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

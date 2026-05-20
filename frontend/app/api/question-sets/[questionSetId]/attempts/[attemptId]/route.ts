import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/question-sets/[questionSetId]/attempts/[attemptId]'>,
) {
  const { questionSetId, attemptId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/question-sets/${questionSetId}/attempts/${attemptId}`)
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/tests/[testId]'>,
) {
  const { testId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/tests/${testId}`, { method: 'DELETE' })
  return new Response(null, { status: res.status })
}

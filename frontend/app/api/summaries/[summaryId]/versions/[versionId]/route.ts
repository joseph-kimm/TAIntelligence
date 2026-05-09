import type { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/summaries/[summaryId]/versions/[versionId]'>,
) {
  const { summaryId, versionId } = await ctx.params
  const res = await fetch(`${BACKEND_URL}/api/summaries/${summaryId}/versions/${versionId}`)
  const data = await res.text()
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

import type { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/chats/[chatId]/messages/[messageId]'>,
) {
  const { chatId, messageId } = await ctx.params
  const body = await request.text()

  const backendRes = await fetch(
    `${BACKEND_URL}/api/chats/${chatId}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  )

  if (!backendRes.ok || !backendRes.body) {
    return new Response(await backendRes.text(), { status: backendRes.status })
  }

  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

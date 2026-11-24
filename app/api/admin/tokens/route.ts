import { NextRequest, NextResponse } from 'next/server'
import { getSession, isStaffEmail } from '@/lib/auth'
import { createToken, listTokens, tokenTableReady, TOKEN_LIFETIMES } from '@/lib/apiTokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Personal import tokens (lib/apiTokens.ts). Session only: a token cannot create tokens.
// Every staff member manages their own; nobody sees anyone else's.

async function staff() {
  const session = await getSession()
  return session && isStaffEmail(session.email) ? session : null
}

/** GET /api/admin/tokens → { ready, tokens[] } (the caller's own). */
export async function GET() {
  const session = await staff()
  if (!session) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  if (!(await tokenTableReady())) return NextResponse.json({ ready: false, tokens: [] })
  return NextResponse.json({ ready: true, tokens: await listTokens(session.email) })
}

/** POST /api/admin/tokens { name, days: 30 | 90 | 365 } → { token, info }. The token is shown once. */
export async function POST(req: NextRequest) {
  const session = await staff()
  if (!session) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  if (!(await tokenTableReady())) {
    return NextResponse.json({ error: 'Import tokens need database migration 011 first.' }, { status: 503 })
  }
  const body = await req.json().catch(() => ({})) as { name?: unknown; days?: unknown }
  const name = typeof body.name === 'string' ? body.name : ''
  const days = Number(body.days)
  if (!(TOKEN_LIFETIMES as readonly number[]).includes(days)) {
    return NextResponse.json({ error: `days must be one of ${TOKEN_LIFETIMES.join(', ')}.` }, { status: 400 })
  }
  const active = (await listTokens(session.email)).filter(t => !t.revokedAt && new Date(t.expiresAt) > new Date())
  if (active.length >= 10) {
    return NextResponse.json({ error: 'You already have 10 active tokens. Revoke one first.' }, { status: 409 })
  }
  const created = await createToken(session.email, name, days)
  return NextResponse.json(created, { status: 201 })
}

import { NextResponse } from 'next/server'
import { getSession, isStaffEmail } from '@/lib/auth'
import { revokeToken } from '@/lib/apiTokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** DELETE /api/admin/tokens/[id] — revokes one of the caller's own tokens (immediately). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || !isStaffEmail(session.email)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const ok = await revokeToken(session.email, params.id)
  if (!ok) return NextResponse.json({ error: 'Token not found.' }, { status: 404 })
  return NextResponse.json({ success: true })
}

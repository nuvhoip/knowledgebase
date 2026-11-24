import { NextRequest, NextResponse } from 'next/server'
import { getSession, isStaffEmail } from '@/lib/auth'
import { decideGrant } from '@/lib/importGrants'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/import-grants/[id] — approve or deny an upload request from Claude, or end
 * one you approved. Staff session only (the approval page). Body: { action: approve | deny | end }.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || !isStaffEmail(session.email)) {
    return NextResponse.json({ error: 'Sign in with a @nuvho.com account.' }, { status: 403 })
  }
  // Only the KB's own pages may send this (the session cookie alone is not enough)
  const from = req.headers.get('origin')
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim()
  if (from) {
    let fromHost = ''
    try { fromHost = new URL(from).host } catch { /* not a URL */ }
    if (!host || fromHost !== host) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  let action: unknown
  try { action = (await req.json())?.action } catch { /* handled below */ }
  if (action !== 'approve' && action !== 'deny' && action !== 'end') {
    return NextResponse.json({ error: 'action must be approve, deny or end.' }, { status: 400 })
  }

  const result = await decideGrant(params.id, session.email, action)
  if (result === 'ok') return NextResponse.json({ success: true })
  const message = {
    'not-found': 'This approval request does not exist.',
    'expired': 'This approval request has expired. Start the save again in Claude.',
    'already-decided': 'This request was already approved or denied.',
    'not-yours': 'Only the person who approved it can end it.',
  }[result]
  return NextResponse.json({ error: message }, { status: result === 'not-found' ? 404 : 409 })
}

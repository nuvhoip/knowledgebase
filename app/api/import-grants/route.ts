import { NextRequest, NextResponse } from 'next/server'
import {
  bearer, grantStatus, grantTableReady, requestGrant, GrantLimitError, GRANT_HOURS, REQUEST_MINUTES,
} from '@/lib/importGrants'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/** The address the person's browser uses (the app sits behind App Platform's proxy). */
function origin(req: NextRequest): string {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim()
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return SITE_URL
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
  const proto = (req.headers.get('x-forwarded-proto') ?? (local ? 'http' : 'https')).split(',')[0].trim()
  return `${proto === 'http' && local ? 'http' : 'https'}://${host}`
}

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
}

/**
 * POST /api/import-grants — ask for permission to upload pages from Claude (no sign-in).
 *
 * Body (JSON, optional): { label } — what is asking, shown on the approval page.
 * Response 201: { grant, userCode, approveUrl, expiresIn, pollInterval, grantHours }.
 *   grant is the secret the caller keeps; it works only after a signed-in staff member opens
 *   approveUrl and clicks Approve. It is returned once.
 */
export async function POST(req: NextRequest) {
  if (!(await grantTableReady())) {
    return NextResponse.json({ error: 'Imports from Claude are not set up yet (migration 011).' }, { status: 503 })
  }
  let label = ''
  try {
    const body = await req.json()
    if (body && typeof body.label === 'string') label = body.label
  } catch { /* no body is fine */ }
  try {
    const { secret, grant } = await requestGrant(label, clientIp(req))
    return NextResponse.json({
      grant: secret,
      userCode: grant.userCode,
      approveUrl: `${origin(req)}/admin/approve-import/${grant.id}`,
      expiresIn: REQUEST_MINUTES * 60,
      pollInterval: 3,
      grantHours: GRANT_HOURS,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof GrantLimitError) return NextResponse.json({ error: err.message }, { status: 429 })
    console.error('[import-grants] request failed', err)
    return NextResponse.json({ error: 'Could not start the approval.' }, { status: 500 })
  }
}

/**
 * GET /api/import-grants — where a request stands (Authorization: Bearer nkg_…).
 * Response: { status: pending | approved | denied | expired, email?, expiresAt }.
 */
export async function GET(req: NextRequest) {
  const secret = bearer(req)
  const grant = secret ? await grantStatus(secret) : null
  if (!grant) return NextResponse.json({ error: 'Unknown approval request.' }, { status: 404 })
  return NextResponse.json(
    { status: grant.status, email: grant.status === 'approved' ? grant.email : undefined, expiresAt: grant.expiresAt },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

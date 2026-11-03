import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSession, isStaffEmail } from '@/lib/auth'

/**
 * Who is submitting content to the Knowledge Base.
 *
 * Two ways in:
 *   - A signed-in staff browser session (the admin dashboard).
 *   - A machine caller (Claude / the Nuvho MCP server) sending
 *       Authorization: Bearer <one of KB_INGEST_API_KEYS>
 *     plus the human it acts for, as X-Submitted-By: someone@nuvho.com
 *
 * KB_INGEST_API_KEYS is a comma-separated list so keys can be rotated without downtime.
 */
export interface IngestActor {
  email: string
  via: 'session' | 'api-key'
}

function keyMatches(given: string): boolean {
  const keys = (process.env.KB_INGEST_API_KEYS ?? '')
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length >= 32) // refuse short / placeholder keys
  const g = Buffer.from(given)
  return keys.some(k => {
    const b = Buffer.from(k)
    return b.length === g.length && timingSafeEqual(b, g)
  })
}

export async function getIngestActor(req: NextRequest): Promise<IngestActor | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (!token || !keyMatches(token)) return null
    const submittedBy = (req.headers.get('x-submitted-by') ?? '').trim().toLowerCase()
    if (!isStaffEmail(submittedBy)) return null
    return { email: submittedBy, via: 'api-key' }
  }

  const session = await getSession()
  if (session && isStaffEmail(session.email)) return { email: session.email, via: 'session' }
  return null
}

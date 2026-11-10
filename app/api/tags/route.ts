import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getTagUsage } from '@/lib/data'
import { getIngestActor } from '@/lib/ingestAuth'
import { hasTagTables } from '@/lib/tags'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tags
 *
 * The tag vocabulary in use, most used first: [{ slug, name, count }]. The
 * nuvho-knowledge-save skill reads this to reuse existing tags instead of inventing
 * near-duplicates ("Booking Engine" vs "booking-engines").
 *
 * Anonymous callers see only tags on published public articles, with public counts.
 * Staff (session, or Bearer KB_INGEST_API_KEYS + X-Submitted-By) see every tag on a
 * published article. Works whether or not KB_TAGS_ENABLED is on.
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await hasTagTables(pool))) return NextResponse.json({ tags: [] })
    const staff = !!(await getIngestActor(req))
    const usage = await getTagUsage()
    const tags = usage
      .map(t => ({ slug: t.slug, name: t.name, count: staff ? t.totalCount : t.publicCount }))
      .filter(t => t.count > 0)
    return NextResponse.json(
      { tags },
      { headers: { 'Cache-Control': staff ? 'private, no-store' : 'public, max-age=300, s-maxage=300' } }
    )
  } catch (err) {
    console.error('[api/tags]', err)
    return NextResponse.json({ error: 'Failed to load tags.' }, { status: 500 })
  }
}

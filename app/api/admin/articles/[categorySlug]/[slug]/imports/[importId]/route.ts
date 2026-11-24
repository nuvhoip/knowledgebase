import { NextResponse } from 'next/server'
import { getImportedHtml } from '@/lib/importDb'
import { staffArticleId } from '@/lib/articleAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: { categorySlug: string; slug: string; importId: string } }

/** GET …/imports/[importId] → { html, title, description }: the body that import produced,
 *  with later asset replacements applied. The editor loads it for "Restore imported version";
 *  nothing changes until the author saves. */
export async function GET(_req: Request, { params }: RouteParams) {
  const who = await staffArticleId(params)
  if (who instanceof NextResponse) return who
  const data = await getImportedHtml(who.id, params.importId)
  if (!data) return NextResponse.json({ error: 'Import not found for this article.' }, { status: 404 })
  return NextResponse.json(data)
}

import { NextResponse } from 'next/server'
import { staffArticleId } from '@/lib/articleAccess'
import { getArticleImports } from '@/lib/importDb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: { categorySlug: string; slug: string } }

/** GET /api/admin/articles/[cat]/[slug]/imports → { ready, imports[], assets[] } for the editor's Assets panel. */
export async function GET(_req: Request, { params }: RouteParams) {
  const who = await staffArticleId(params)
  if (who instanceof NextResponse) return who
  const data = await getArticleImports(who.id)
  if (!data) return NextResponse.json({ ready: false, imports: [], assets: [] })
  return NextResponse.json({ ready: true, ...data })
}

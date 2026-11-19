import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { searchArticles } from '@/lib/search'
import type { AdminSearchSuggestion } from '@/lib/types'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 100

// GET /api/admin/search?q=…[&limit=n] — fuzzy article search for the admin dashboard.
// Same engine as /api/search (lib/search.ts) but over EVERY article, pending included,
// with no visibility filter: admins see everything. limit defaults to a dropdown's worth;
// the dashboard asks for more when it filters the Articles table to "all results".
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').slice(0, 200)
  const requested = Number(params.get('limit'))
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const docs = await searchArticles(q, limit, 'admin')
    const suggestions: AdminSearchSuggestion[] = docs.map(d => ({
      title: d.article.title,
      description: d.article.description,
      categorySlug: d.article.categorySlug,
      slug: d.article.slug,
      categoryTitle: d.categoryTitle,
      subcategoryTitle: d.subcategoryTitle,
      isPrivate: d.article.effectiveVisibility === 'private',
      status: d.article.status,
    }))
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[/api/admin/search] Error:', err)
    return NextResponse.json({ suggestions: [], error: 'Search failed' }, { status: 500 })
  }
}

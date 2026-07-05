import { NextRequest, NextResponse } from 'next/server'
import { searchArticles } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''

  try {
    const articles = await searchArticles(q)
    return NextResponse.json({ articles })
  } catch (err) {
    console.error('[/api/search] Error:', err)
    return NextResponse.json({ articles: [], error: 'Search failed' }, { status: 500 })
  }
}

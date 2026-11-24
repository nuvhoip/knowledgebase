import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, isStaffEmail } from '@/lib/auth'

/** For the article import routes: the article id for a staff session, or the response to return. */
export async function staffArticleId(params: { categorySlug: string; slug: string }): Promise<{ id: number; email: string } | NextResponse> {
  const session = await getSession()
  if (!session || !isStaffEmail(session.email)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const r = await pool.query('SELECT id FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2', [params.categorySlug, params.slug])
  if (!r.rowCount) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
  return { id: r.rows[0].id as number, email: session.email }
}

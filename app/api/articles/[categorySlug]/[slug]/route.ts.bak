import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

/** PATCH /api/articles/[categorySlug]/[slug]
 *  Updates an article. Restricted to @nuvho.com users.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()

  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, content, readTime } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    const result = await pool.query(
      `UPDATE nuvho_kb.articles
       SET title       = $1,
           description = $2,
           content     = $3,
           read_time   = $4,
           updated_at  = NOW()
       WHERE category_slug = $5 AND slug = $6
       RETURNING slug`,
      [
        title.trim(),
        description.trim(),
        content ?? null,
        Number(readTime) || 5,
        params.categorySlug,
        params.slug,
      ]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/articles PATCH]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

/** DELETE /api/admin/articles/[categorySlug]/[slug] — delete an article */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(
        `DELETE FROM nuvho_kb.articles
         WHERE category_slug = $1 AND slug = $2
         RETURNING slug`,
        [params.categorySlug, params.slug]
      )
      if (result.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
      }
      await client.query(
        `UPDATE nuvho_kb.categories
         SET article_count = (SELECT COUNT(*) FROM nuvho_kb.articles WHERE category_slug = $1)
         WHERE slug = $1`,
        [params.categorySlug]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/articles DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete article.' }, { status: 500 })
  }
}

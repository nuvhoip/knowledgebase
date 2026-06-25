import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

/** PATCH /api/admin/articles/[categorySlug]/[slug]
 *  Publish or unpublish an article.
 *  Body: { action: 'publish' | 'unpublish' }
 *  Updates article_count on the category accordingly.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { action } = body

    if (action !== 'publish' && action !== 'unpublish') {
      return NextResponse.json({ error: 'action must be "publish" or "unpublish".' }, { status: 400 })
    }

    const newStatus = action === 'publish' ? 'published' : 'pending'

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get current status first
      const current = await client.query(
        `SELECT status FROM nuvho_kb.articles
         WHERE category_slug = $1 AND slug = $2`,
        [params.categorySlug, params.slug]
      )
      if (current.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
      }

      const prevStatus = current.rows[0].status
      if (prevStatus === newStatus) {
        await client.query('ROLLBACK')
        return NextResponse.json({ success: true, status: newStatus, changed: false })
      }

      // Update status
      await client.query(
        `UPDATE nuvho_kb.articles
         SET status = $1, updated_at = NOW()
         WHERE category_slug = $2 AND slug = $3`,
        [newStatus, params.categorySlug, params.slug]
      )

      // Recalculate article_count (only published articles)
      await client.query(
        `UPDATE nuvho_kb.categories
         SET article_count = (
           SELECT COUNT(*) FROM nuvho_kb.articles
           WHERE category_slug = $1 AND status = 'published'
         )
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

    return NextResponse.json({ success: true, status: newStatus, changed: true })
  } catch (err) {
    console.error('[admin/articles PATCH]', err)
    return NextResponse.json({ error: 'Failed to update article status.' }, { status: 500 })
  }
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
         RETURNING slug, status`,
        [params.categorySlug, params.slug]
      )
      if (result.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
      }

      // Only recalculate count if a published article was deleted
      await client.query(
        `UPDATE nuvho_kb.categories
         SET article_count = (
           SELECT COUNT(*) FROM nuvho_kb.articles
           WHERE category_slug = $1 AND status = 'published'
         )
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

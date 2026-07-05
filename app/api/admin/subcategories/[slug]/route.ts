import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { slug: string }
}

const VALID_VISIBILITY = ['public', 'private'] as const

/** PATCH /api/admin/subcategories/[slug] — update title, description, visibility (null = inherit) */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, visibility } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    if (visibility != null && !VALID_VISIBILITY.includes(visibility)) {
      return NextResponse.json({ error: `visibility must be one of: ${VALID_VISIBILITY.join(', ')}, or null to inherit.` }, { status: 400 })
    }

    const result = await pool.query(
      `UPDATE nuvho_kb.subcategories
       SET title = $1, description = $2, visibility = $3
       WHERE slug = $4
       RETURNING slug`,
      [title.trim(), description.trim(), visibility ?? null, params.slug]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Sub-category not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/subcategories PATCH]', err)
    return NextResponse.json({ error: 'Failed to update sub-category.' }, { status: 500 })
  }
}

/** DELETE /api/admin/subcategories/[slug] — delete a sub-category and all its articles */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const catRes = await client.query(
        'SELECT category_slug FROM nuvho_kb.subcategories WHERE slug = $1',
        [params.slug]
      )
      if (catRes.rowCount === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Sub-category not found.' }, { status: 404 })
      }
      const categorySlug = catRes.rows[0].category_slug

      await client.query('DELETE FROM nuvho_kb.articles WHERE subcategory_slug = $1', [params.slug])
      await client.query('DELETE FROM nuvho_kb.subcategories WHERE slug = $1', [params.slug])

      // Recalculate the parent category's published article_count
      await client.query(
        `UPDATE nuvho_kb.categories
         SET article_count = (
           SELECT COUNT(*) FROM nuvho_kb.articles WHERE category_slug = $1 AND status = 'published'
         )
         WHERE slug = $1`,
        [categorySlug]
      )

      await client.query('COMMIT')
      return NextResponse.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[admin/subcategories DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete sub-category.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { slug: string }
}

/** PATCH /api/admin/categories/[slug] — update title, description, icon */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, icon } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    const result = await pool.query(
      `UPDATE nuvho_kb.categories
       SET title = $1, description = $2, icon = $3
       WHERE slug = $4
       RETURNING slug`,
      [title.trim(), description.trim(), (icon || 'rocket.svg').trim(), params.slug]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/categories PATCH]', err)
    return NextResponse.json({ error: 'Failed to update category.' }, { status: 500 })
  }
}

/** DELETE /api/admin/categories/[slug] — delete category and all its articles */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'DELETE FROM nuvho_kb.articles WHERE category_slug = $1',
        [params.slug]
      )
      const result = await client.query(
        'DELETE FROM nuvho_kb.categories WHERE slug = $1 RETURNING slug',
        [params.slug]
      )
      await client.query('COMMIT')

      if (result.rowCount === 0) {
        return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[admin/categories DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete category.' }, { status: 500 })
  }
}

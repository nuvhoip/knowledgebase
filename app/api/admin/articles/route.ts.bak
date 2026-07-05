import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** GET /api/admin/articles — list ALL articles (including pending) with category info */
export async function GET() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const result = await pool.query(
      `SELECT
         a.slug,
         a.title,
         a.description,
         a.category_slug,
         c.title AS category_title,
         a.read_time,
         a.featured,
         a.sort_order,
         a.status,
         a.updated_at,
         a.vector_tier,
         a.vector_synced_at
       FROM nuvho_kb.articles a
       JOIN nuvho_kb.categories c ON c.slug = a.category_slug
       ORDER BY
         CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
         c.sort_order ASC, a.sort_order ASC, a.title ASC`
    )
    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[admin/articles GET]', err)
    return NextResponse.json({ error: 'Failed to fetch articles.' }, { status: 500 })
  }
}

/** POST /api/admin/articles — create a new article (always starts as 'pending') */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, categorySlug, content, readTime, featured } = body

    if (!title?.trim() || !description?.trim() || !categorySlug?.trim()) {
      return NextResponse.json({ error: 'Title, description and category are required.' }, { status: 400 })
    }

    const catCheck = await pool.query(
      'SELECT slug FROM nuvho_kb.categories WHERE slug = $1',
      [categorySlug.trim()]
    )
    if (catCheck.rowCount === 0) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
    }

    const slug = slugify(title.trim())
    if (!slug) {
      return NextResponse.json({ error: 'Could not generate a valid slug from that title.' }, { status: 400 })
    }

    const maxRes = await pool.query(
      'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM nuvho_kb.articles WHERE category_slug = $1',
      [categorySlug.trim()]
    )
    const order = maxRes.rows[0].next

    // Insert with status = 'pending' — article_count is NOT incremented until published
    await pool.query(
      `INSERT INTO nuvho_kb.articles
         (slug, title, description, category_slug, content, read_time, featured, sort_order, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())`,
      [slug, title.trim(), description.trim(), categorySlug.trim(), content || null,
       Number(readTime) || 5, Boolean(featured), order]
    )

    return NextResponse.json({ success: true, slug, categorySlug: categorySlug.trim(), status: 'pending' })
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'An article with that title already exists in this category.' }, { status: 409 })
    }
    console.error('[admin/articles POST]', err)
    return NextResponse.json({ error: 'Failed to create article.' }, { status: 500 })
  }
}

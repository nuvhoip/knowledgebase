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

const VALID_VISIBILITY = ['public', 'private'] as const

/** GET /api/admin/subcategories?category=<slug> — list sub-categories, optionally filtered by category */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const categorySlug = req.nextUrl.searchParams.get('category')

  try {
    const result = categorySlug
      ? await pool.query(
          `SELECT slug, title, description, category_slug, sort_order, article_count, visibility
           FROM nuvho_kb.subcategories
           WHERE category_slug = $1
           ORDER BY sort_order ASC, title ASC`,
          [categorySlug]
        )
      : await pool.query(
          `SELECT s.slug, s.title, s.description, s.category_slug, s.sort_order, s.article_count, s.visibility,
                  c.title AS category_title
           FROM nuvho_kb.subcategories s
           JOIN nuvho_kb.categories c ON c.slug = s.category_slug
           ORDER BY c.sort_order ASC, s.sort_order ASC, s.title ASC`
        )
    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[admin/subcategories GET]', err)
    return NextResponse.json({ error: 'Failed to fetch sub-categories.' }, { status: 500 })
  }
}

/** POST /api/admin/subcategories — create a new sub-category under a category */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, categorySlug, visibility, sortOrder } = body

    if (!title?.trim() || !description?.trim() || !categorySlug?.trim()) {
      return NextResponse.json({ error: 'Title, description and category are required.' }, { status: 400 })
    }

    if (visibility != null && !VALID_VISIBILITY.includes(visibility)) {
      return NextResponse.json({ error: `visibility must be one of: ${VALID_VISIBILITY.join(', ')}, or omitted to inherit.` }, { status: 400 })
    }

    const catCheck = await pool.query('SELECT slug FROM nuvho_kb.categories WHERE slug = $1', [categorySlug.trim()])
    if (catCheck.rowCount === 0) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
    }

    const slug = slugify(title.trim())
    if (!slug) {
      return NextResponse.json({ error: 'Could not generate a valid slug from that title.' }, { status: 400 })
    }

    let order = Number(sortOrder) || null
    if (!order) {
      const maxRes = await pool.query(
        'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM nuvho_kb.subcategories WHERE category_slug = $1',
        [categorySlug.trim()]
      )
      order = maxRes.rows[0].next
    }

    await pool.query(
      `INSERT INTO nuvho_kb.subcategories (slug, category_slug, title, description, sort_order, article_count, visibility)
       VALUES ($1, $2, $3, $4, $5, 0, $6)`,
      [slug, categorySlug.trim(), title.trim(), description.trim(), order, visibility ?? null]
    )

    return NextResponse.json({ success: true, slug })
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'A sub-category with that name already exists.' }, { status: 409 })
    }
    console.error('[admin/subcategories POST]', err)
    return NextResponse.json({ error: 'Failed to create sub-category.' }, { status: 500 })
  }
}

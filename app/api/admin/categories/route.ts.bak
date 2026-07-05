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

/** GET /api/admin/categories — list all categories with article counts */
export async function GET() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const result = await pool.query(
      `SELECT slug, title, description, icon, article_count, sort_order
       FROM nuvho_kb.categories
       ORDER BY sort_order ASC, title ASC`
    )
    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[admin/categories GET]', err)
    return NextResponse.json({ error: 'Failed to fetch categories.' }, { status: 500 })
  }
}

/** POST /api/admin/categories — create a new category */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, icon, sortOrder } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    const slug = slugify(title.trim())
    if (!slug) {
      return NextResponse.json({ error: 'Could not generate a valid slug from that title.' }, { status: 400 })
    }

    let order = Number(sortOrder) || null
    if (!order) {
      const maxRes = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM nuvho_kb.categories')
      order = maxRes.rows[0].next
    }

    await pool.query(
      `INSERT INTO nuvho_kb.categories (slug, title, description, icon, article_count, sort_order)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [slug, title.trim(), description.trim(), (icon || 'rocket.svg').trim(), order]
    )

    return NextResponse.json({ success: true, slug })
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'A category with that name already exists.' }, { status: 409 })
    }
    console.error('[admin/categories POST]', err)
    return NextResponse.json({ error: 'Failed to create category.' }, { status: 500 })
  }
}

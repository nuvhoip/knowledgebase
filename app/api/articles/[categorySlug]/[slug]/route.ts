import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sanitizeArticleHtml } from '@/lib/sanitize'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

const VALID_VISIBILITY = ['public', 'private'] as const

/** PATCH /api/articles/[categorySlug]/[slug]
 *  Updates an article. Restricted to @nuvho.com users.
 *  subcategorySlug and visibility are optional — omit to leave unchanged.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()

  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, content, readTime, subcategorySlug, visibility } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    if (visibility !== undefined && visibility !== null && !VALID_VISIBILITY.includes(visibility)) {
      return NextResponse.json({ error: `visibility must be one of: ${VALID_VISIBILITY.join(', ')}, or null to inherit.` }, { status: 400 })
    }

    if (subcategorySlug) {
      const subCheck = await pool.query(
        'SELECT slug FROM nuvho_kb.subcategories WHERE slug = $1 AND category_slug = $2',
        [subcategorySlug, params.categorySlug]
      )
      if (subCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Sub-category not found in this category.' }, { status: 404 })
      }
    }

    const before = await pool.query(
      'SELECT subcategory_slug FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2',
      [params.categorySlug, params.slug]
    )
    if (before.rowCount === 0) {
      return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
    }
    const previousSubcategorySlug = before.rows[0].subcategory_slug

    // visibility: undefined (key omitted) = leave unchanged, null = clear override (inherit),
    // 'public'|'private' = explicit override.
    const result = await pool.query(
      `UPDATE nuvho_kb.articles
       SET title            = $1,
           description      = $2,
           content          = $3,
           read_time        = $4,
           subcategory_slug = COALESCE($5, subcategory_slug),
           visibility       = CASE WHEN $6 THEN visibility ELSE $7 END,
           updated_at       = NOW()
       WHERE category_slug = $8 AND slug = $9
       RETURNING slug, subcategory_slug`,
      [
        title.trim(),
        description.trim(),
        sanitizeArticleHtml(content),
        Number(readTime) || 5,
        subcategorySlug || null,
        visibility === undefined,
        visibility ?? null,
        params.categorySlug,
        params.slug,
      ]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
    }

    // If the article moved to a different sub-category, keep both sub-categories'
    // published article_count accurate (categories.article_count is unaffected since
    // this route never changes an article's top-level category).
    const newSubcategorySlug = result.rows[0].subcategory_slug
    if (newSubcategorySlug !== previousSubcategorySlug) {
      await pool.query(
        `UPDATE nuvho_kb.subcategories SET article_count = (
           SELECT COUNT(*) FROM nuvho_kb.articles WHERE subcategory_slug = $1 AND status = 'published'
         ) WHERE slug = $1`,
        [previousSubcategorySlug]
      )
      await pool.query(
        `UPDATE nuvho_kb.subcategories SET article_count = (
           SELECT COUNT(*) FROM nuvho_kb.articles WHERE subcategory_slug = $1 AND status = 'published'
         ) WHERE slug = $1`,
        [newSubcategorySlug]
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/articles PATCH]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

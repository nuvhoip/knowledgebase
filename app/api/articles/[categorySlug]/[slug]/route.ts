import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { isVersioningEnabled } from '@/lib/flags'
import { ensureBaseline, lockArticle, snapshotArticle, withDb } from '@/lib/versions'
import { setArticleTags } from '@/lib/tags'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

const VALID_VISIBILITY = ['public', 'private'] as const

/** PATCH /api/articles/[categorySlug]/[slug]
 *  Updates an article. Restricted to @nuvho.com users.
 *  subcategorySlug and visibility are optional — omit to leave unchanged.
 *  subcategorySlug may belong to a different category: the article then moves to that
 *  category (the trg_sync_article_category_slug trigger rewrites articles.category_slug).
 *  This is how admins file Claude Inbox submissions under a real category.
 *  tags (string[] or comma-separated string) is optional — omit to leave the tags unchanged,
 *  [] to remove them all. Sent by the editor only when KB_TAGS_ENABLED is on.
 *  Responds with the article's (possibly new) categorySlug and slug.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()

  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, description, content, readTime, subcategorySlug, visibility, changeSummary, tags } = body

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
    }

    if (visibility !== undefined && visibility !== null && !VALID_VISIBILITY.includes(visibility)) {
      return NextResponse.json({ error: `visibility must be one of: ${VALID_VISIBILITY.join(', ')}, or null to inherit.` }, { status: 400 })
    }

    // The target sub-category decides the target category (it may differ from the URL's).
    let targetCategorySlug = params.categorySlug
    if (subcategorySlug) {
      const subCheck = await pool.query(
        'SELECT category_slug FROM nuvho_kb.subcategories WHERE slug = $1',
        [subcategorySlug]
      )
      if (subCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Sub-category not found.' }, { status: 404 })
      }
      targetCategorySlug = subCheck.rows[0].category_slug
    }
    const movingCategory = targetCategorySlug !== params.categorySlug

    // KB_VERSIONING_ENABLED: the save and its history snapshot commit together in one
    // transaction. Flag off: the same queries as before, straight on the pool.
    const versioning = isVersioningEnabled()
    // Tags are written in the same transaction as the article
    const updatingTags = tags !== undefined
    return await withDb(pool, versioning || updatingTags, async db => {
      const articleId = versioning ? await lockArticle(db, params.categorySlug, params.slug) : null

      const before = await db.query(
        'SELECT subcategory_slug FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2',
        [params.categorySlug, params.slug]
      )
      if (before.rowCount === 0) {
        return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
      }
      const previousSubcategorySlug = before.rows[0].subcategory_slug

      // Article URLs are /articles/[category]/[slug], so a slug must be unique within its
      // category — refuse a move that would collide instead of failing on the UPDATE.
      if (movingCategory) {
        const clash = await db.query(
          'SELECT 1 FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2',
          [targetCategorySlug, params.slug]
        )
        if (clash.rowCount) {
          return NextResponse.json(
            { error: 'An article with the same slug already exists in the target category. Rename one of them first.' },
            { status: 409 }
          )
        }
      }

      if (articleId) await ensureBaseline(db, articleId)

      // visibility: undefined (key omitted) = leave unchanged, null = clear override (inherit),
      // 'public'|'private' = explicit override.
      const result = await db.query(
        `UPDATE nuvho_kb.articles
         SET title            = $1,
             description      = $2,
             content          = $3,
             read_time        = $4,
             subcategory_slug = COALESCE($5, subcategory_slug),
             visibility       = CASE WHEN $6 THEN visibility ELSE $7 END,
             updated_at       = NOW()
         WHERE category_slug = $8 AND slug = $9
         RETURNING id, slug, category_slug, subcategory_slug`,
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

      if (updatingTags) await setArticleTags(db, result.rows[0].id, tags)

      if (articleId) {
        await snapshotArticle(db, articleId, {
          source: 'editor',
          changedBy: session.email,
          changeSummary: typeof changeSummary === 'string' ? changeSummary.slice(0, 500) : null,
        })
      }

      // If the article moved to a different sub-category, keep both sub-categories'
      // published article_count accurate — and both categories' too when it changed category.
      const newSubcategorySlug = result.rows[0].subcategory_slug
      const newCategorySlug = result.rows[0].category_slug
      if (newSubcategorySlug !== previousSubcategorySlug) {
        await db.query(
          `UPDATE nuvho_kb.subcategories SET article_count = (
             SELECT COUNT(*) FROM nuvho_kb.articles WHERE subcategory_slug = $1 AND status = 'published'
           ) WHERE slug = $1`,
          [previousSubcategorySlug]
        )
        await db.query(
          `UPDATE nuvho_kb.subcategories SET article_count = (
             SELECT COUNT(*) FROM nuvho_kb.articles WHERE subcategory_slug = $1 AND status = 'published'
           ) WHERE slug = $1`,
          [newSubcategorySlug]
        )
      }
      if (newCategorySlug !== params.categorySlug) {
        for (const cat of [params.categorySlug, newCategorySlug]) {
          await db.query(
            `UPDATE nuvho_kb.categories SET article_count = (
               SELECT COUNT(*) FROM nuvho_kb.articles WHERE category_slug = $1 AND status = 'published'
             ) WHERE slug = $1`,
            [cat]
          )
        }
        // Keep the Claude import log pointing at the article's new home. Skipped when
        // migration 007 hasn't been run (an error here would abort the save's transaction).
        const hasImportLog = await db.query(`SELECT to_regclass('nuvho_kb.vector_imports') IS NOT NULL AS ok`)
        if (hasImportLog.rows[0]?.ok) {
          await db.query(
            `UPDATE nuvho_kb.vector_imports SET category_slug = $1
             WHERE category_slug = $2 AND article_slug = $3`,
            [newCategorySlug, params.categorySlug, params.slug]
          )
        }
      }

      return NextResponse.json({ success: true, categorySlug: newCategorySlug, slug: result.rows[0].slug })
    })
  } catch (err) {
    console.error('[api/articles PATCH]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

import pool from '@/lib/db'
import { createPendingArticle, slugify, stripHtml } from '@/lib/claudeImport'
import { attachImport } from '@/lib/importDb'
import { isVersioningEnabled } from '@/lib/flags'
import { ensureBaseline, snapshotArticle } from '@/lib/versions'
import { setArticleTags } from '@/lib/tags'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import type { ImportOutcome } from '@/lib/importPipeline'
import { isTier, type Tier } from '@/lib/vectorTiers'

// mode=submit of POST /api/admin/import (the nuvho-knowledge-save skill, approved in the browser):
// the imported page becomes a PENDING article (decision 24 Nov 2026: skill exports stay
// pending until an admin publishes them).
//
// Re-exports: when the same (sourceTier, sourceId) was submitted before,
//   - the article is still pending  → it is updated in place (a new version is recorded)
//   - the article is published      → refused (409): a published page is never changed by a
//                                      grant; the admin re-imports it in the editor instead
//   - the article was deleted       → refused (409): an admin denied it; use a new sourceId

export interface SubmitMeta {
  title?: string
  description?: string
  categorySlug?: string
  subcategorySlug?: string
  visibility?: 'public' | 'private' | null
  tags?: string[]
  sourceTier?: string
  sourceId?: string
  readTime?: number
}

export type SubmitResult =
  | { status: 'created' | 'updated'; categorySlug: string; slug: string; inbox: boolean }
  | { status: 'refused'; reason: string; categorySlug?: string; slug?: string; httpStatus: number }

function readTimeOf(html: string, given?: number): number {
  if (given && given > 0 && given <= 120) return Math.round(given)
  return Math.max(1, Math.round(stripHtml(html).split(/\s+/).filter(Boolean).length / 200))
}

export async function submitImportedArticle(outcome: ImportOutcome, meta: SubmitMeta, by: string, sourceName: string): Promise<SubmitResult> {
  const title = (meta.title?.trim() || outcome.title || '').slice(0, 300)
  if (!title || !slugify(title)) return { status: 'refused', reason: 'The page has no title. Send a title field.', httpStatus: 400 }
  const description = (meta.description?.trim() || outcome.description || '').slice(0, 300)
  const tags = meta.tags?.length ? meta.tags : outcome.tags
  const tier: Tier | 'kb' | undefined = meta.sourceId ? (isTier(meta.sourceTier) ? meta.sourceTier : 'kb') : undefined
  const sourceId = meta.sourceId?.trim().slice(0, 255) || undefined
  const versioning = isVersioningEnabled()
  const summary = `Imported from ${sourceName} (Claude)`.slice(0, 500)

  // ── A re-export of something submitted before ──
  if (tier && sourceId) {
    const seen = await pool.query(
      `SELECT v.category_slug, v.article_slug, a.id, a.status, a.submitted_by
         FROM nuvho_kb.vector_imports v
         LEFT JOIN nuvho_kb.articles a ON a.category_slug = v.category_slug AND a.slug = v.article_slug
        WHERE v.source_tier = $1 AND v.source_vector_id = $2`,
      [tier, sourceId],
    )
    if (seen.rowCount) {
      const row = seen.rows[0]
      if (!row.id) {
        return { status: 'refused', httpStatus: 409, reason: 'This entry was submitted before and its article was removed by an admin. Send it with a new sourceId to submit it again.' }
      }
      if (row.status !== 'pending') {
        return {
          status: 'refused', httpStatus: 409, categorySlug: row.category_slug, slug: row.article_slug,
          reason: 'This article is already published, so it is not changed from Claude. Ask an admin to open it in the editor and use Import with the new page (it shows the result before saving and records a version).',
        }
      }
      // Only the person who submitted it may replace it from Claude (a grant knows sourceIds, not owners)
      if (row.submitted_by && String(row.submitted_by).toLowerCase() !== by.toLowerCase()) {
        return {
          status: 'refused', httpStatus: 409, categorySlug: row.category_slug, slug: row.article_slug,
          reason: `This entry was submitted by ${row.submitted_by}. Only they can update it from Claude; send yours with a different sourceId.`,
        }
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Re-check under the row lock: an admin may have published it since the check above
        const locked = await client.query('SELECT status FROM nuvho_kb.articles WHERE id = $1 FOR UPDATE', [row.id])
        if (locked.rows[0]?.status !== 'pending') {
          await client.query('ROLLBACK')
          return {
            status: 'refused', httpStatus: 409, categorySlug: row.category_slug, slug: row.article_slug,
            reason: 'This article was published a moment ago, so it is not changed from Claude. Ask an admin to use Import in its editor.',
          }
        }
        if (versioning) await ensureBaseline(client, row.id)
        await client.query(
          `UPDATE nuvho_kb.articles
              SET title = $2, description = $3, content = $4, read_time = $5,
                  visibility = COALESCE($6, visibility), updated_at = NOW()
            WHERE id = $1 AND status = 'pending'`,
          [row.id, title, description || title, sanitizeArticleHtml(outcome.html), readTimeOf(outcome.html, meta.readTime), meta.visibility ?? null],
        )
        if (tags.length) await setArticleTags(client, row.id, tags)
        if (outcome.importId) await attachImport(client, outcome.importId, row.id)
        if (versioning) await snapshotArticle(client, row.id, { source: 'ingest', changedBy: by, changeSummary: `Re-${summary.charAt(0).toLowerCase()}${summary.slice(1)}` })
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
      return { status: 'updated', categorySlug: row.category_slug, slug: row.article_slug, inbox: row.category_slug === 'claude-inbox' }
    }
  }

  // ── A new pending article ──
  const res = await createPendingArticle({
    title,
    description,
    content: outcome.html,
    categorySlug: meta.categorySlug,
    subcategorySlug: meta.subcategorySlug,
    visibility: meta.visibility ?? null,
    readTime: readTimeOf(outcome.html, meta.readTime),
    sourceTier: tier,
    sourceVectorId: sourceId,
    submittedBy: by,
    via: 'claude-push',
    tags,
    afterInsert: async (db, articleId) => {
      if (outcome.importId) await attachImport(db, outcome.importId, articleId)
      if (versioning) await snapshotArticle(db, articleId, { source: 'ingest', changedBy: by, changeSummary: summary })
    },
  })
  if (!res.created) {
    return { status: 'refused', httpStatus: res.reason === 'already-submitted' ? 409 : 400, reason: `Not created: ${res.reason}.`, categorySlug: res.categorySlug, slug: res.slug }
  }
  return { status: 'created', categorySlug: res.categorySlug, slug: res.slug, inbox: res.inbox }
}

// Article version history (Jude + Glenn, IT Catchup 13 Oct 2026): a GitHub-style history of
// every saved state of an article, with restore. Behind KB_VERSIONING_ENABLED (lib/flags.ts);
// nothing here runs while the flag is off.
//
// Every function takes the database handle it should use (`Db`): the save routes pass the
// pooled client of their transaction, so a save and its snapshot commit or roll back
// together, and the tests pass a fake that records the queries.
//
// Table: nuvho_kb.article_versions (see docs/handover/2026-10-kb-db-changes-for-glenn.md).

import type { Pool } from 'pg'
import { sanitizeArticleHtml } from './sanitize'

/** The slice of pg's Pool / PoolClient used here. */
export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>
}

// Client components import only the types below (`import type`), never values, so pg and
// sanitize-html stay out of the browser bundle.
export type VersionSource = 'backfill' | 'baseline' | 'editor' | 'create' | 'ingest' | 'status' | 'restore'

export interface VersionSummary {
  versionNumber: number
  title: string
  changedBy: string | null
  changedAt: string // ISO
  source: VersionSource
  changeSummary: string | null
  restoredFrom: number | null
}

export interface ArticleVersion extends VersionSummary {
  description: string
  content: string | null
  categorySlug: string
  subcategorySlug: string
  status: 'pending' | 'published'
  visibility: 'public' | 'private' | null
  readTime: number | null
  featured: boolean | null
}

export interface SnapshotMeta {
  source: VersionSource
  changedBy: string | null
  changeSummary?: string | null
  restoredFrom?: number | null
  /** Record even when nothing changed since the latest version (restores always do). */
  force?: boolean
}

/** Article columns copied into each version, in matching order. */
const COLUMNS = 'title, description, content, category_slug, subcategory_slug, status, visibility, read_time, featured'
const A_COLUMNS = COLUMNS.split(', ').map(c => `a.${c}`).join(', ')
const L_COLUMNS = COLUMNS.split(', ').map(c => `l.${c}`).join(', ')

/** Runs `fn` in a transaction on one pooled client when `transactional`, else straight on the pool. */
export async function withDb<T>(pool: Pool, transactional: boolean, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!transactional) return fn(pool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Locks the article row for the rest of the transaction, so concurrent saves of the same
 * article get consecutive version numbers. Returns its id, or null when it doesn't exist.
 */
export async function lockArticle(db: Db, categorySlug: string, slug: string): Promise<number | null> {
  const res = await db.query(
    'SELECT id FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2 FOR UPDATE',
    [categorySlug, slug]
  )
  return res.rows[0]?.id ?? null
}

/**
 * Before the first tracked write to an article with no history (created before versioning,
 * or by the import pipeline outside this app), stores its current state as version 1.
 */
export async function ensureBaseline(db: Db, articleId: number): Promise<void> {
  await db.query(
    `INSERT INTO nuvho_kb.article_versions
       (article_id, version_number, ${COLUMNS}, changed_by, source, change_summary)
     SELECT a.id, 1, ${A_COLUMNS}, NULL, 'baseline', 'State before the first tracked change'
     FROM nuvho_kb.articles a
     WHERE a.id = $1
       AND NOT EXISTS (SELECT 1 FROM nuvho_kb.article_versions v WHERE v.article_id = a.id)`,
    [articleId]
  )
}

/**
 * Records the article's current row as the next version. Call after the write, inside the
 * same transaction. Skipped (returns null) when nothing differs from the latest version,
 * unless `force`. Returns the new version number.
 */
export async function snapshotArticle(db: Db, articleId: number, meta: SnapshotMeta): Promise<number | null> {
  const res = await db.query(
    `INSERT INTO nuvho_kb.article_versions
       (article_id, version_number, ${COLUMNS}, changed_by, source, change_summary, restored_from)
     SELECT a.id, COALESCE(l.version_number, 0) + 1, ${A_COLUMNS}, $2, $3, $4, $5
     FROM nuvho_kb.articles a
     LEFT JOIN LATERAL (
       SELECT * FROM nuvho_kb.article_versions v
       WHERE v.article_id = a.id ORDER BY v.version_number DESC LIMIT 1
     ) l ON true
     WHERE a.id = $1
       AND ($6::boolean OR l.id IS NULL OR (${L_COLUMNS}) IS DISTINCT FROM (${A_COLUMNS}))
     RETURNING version_number`,
    [
      articleId,
      meta.changedBy,
      meta.source,
      meta.changeSummary?.trim() || null,
      meta.restoredFrom ?? null,
      meta.force ?? false,
    ]
  )
  return res.rows[0]?.version_number ?? null
}

function mapSummary(r: Record<string, unknown>): VersionSummary {
  return {
    versionNumber: r.version_number as number,
    title: r.title as string,
    changedBy: (r.changed_by as string | null) ?? null,
    changedAt: new Date(r.changed_at as string | Date).toISOString(),
    source: r.source as VersionSource,
    changeSummary: (r.change_summary as string | null) ?? null,
    restoredFrom: (r.restored_from as number | null) ?? null,
  }
}

/** Newest first. */
export async function listVersions(db: Db, articleId: number): Promise<VersionSummary[]> {
  const res = await db.query(
    `SELECT version_number, title, changed_by, changed_at, source, change_summary, restored_from
     FROM nuvho_kb.article_versions WHERE article_id = $1 ORDER BY version_number DESC`,
    [articleId]
  )
  return res.rows.map(mapSummary)
}

export async function getVersion(db: Db, articleId: number, versionNumber: number): Promise<ArticleVersion | null> {
  const res = await db.query(
    `SELECT version_number, ${COLUMNS}, changed_by, changed_at, source, change_summary, restored_from
     FROM nuvho_kb.article_versions WHERE article_id = $1 AND version_number = $2`,
    [articleId, versionNumber]
  )
  const r = res.rows[0]
  if (!r) return null
  return {
    ...mapSummary(r),
    description: r.description,
    content: r.content,
    categorySlug: r.category_slug,
    subcategorySlug: r.subcategory_slug,
    status: r.status,
    visibility: r.visibility,
    readTime: r.read_time,
    featured: r.featured,
  }
}

export class VersionNotFoundError extends Error {}

/**
 * Restores version `versionNumber` as a NEW version: copies its title, description, body and
 * read time onto the article (status, category and visibility stay as they are), then
 * snapshots with source 'restore'. Newer history is never deleted. Run inside a transaction.
 */
export async function restoreVersion(
  db: Db,
  articleId: number,
  versionNumber: number,
  changedBy: string
): Promise<number> {
  const version = await getVersion(db, articleId, versionNumber)
  if (!version) throw new VersionNotFoundError(`Version ${versionNumber} not found.`)

  await ensureBaseline(db, articleId)
  await db.query(
    `UPDATE nuvho_kb.articles
     SET title = $1, description = $2, content = $3, read_time = COALESCE($4, read_time), updated_at = NOW()
     WHERE id = $5`,
    // Re-sanitised on the way back in, as on every other save path
    [version.title, version.description, sanitizeArticleHtml(version.content), version.readTime, articleId]
  )
  const created = await snapshotArticle(db, articleId, {
    source: 'restore',
    changedBy,
    changeSummary: `Restored version ${versionNumber}`,
    restoredFrom: versionNumber,
    force: true,
  })
  return created as number
}

/** Latest version number and who made it, per article — feeds the content index. */
export async function getLatestVersions(db: Db): Promise<Map<number, { version: number; changedBy: string | null }>> {
  const res = await db.query(
    `SELECT DISTINCT ON (article_id) article_id, version_number, changed_by
     FROM nuvho_kb.article_versions
     ORDER BY article_id, version_number DESC`
  )
  return new Map(res.rows.map(r => [r.article_id as number, { version: r.version_number as number, changedBy: r.changed_by ?? null }]))
}

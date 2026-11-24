import pool from '@/lib/db'
import type { Db } from '@/lib/versions'

// Import records (scripts/011_article_imports.sql): which page an article was imported from,
// the article body that import produced, and the assets it brought. Powers the editor's
// Assets panel and "Restore imported version". Every function degrades to "nothing" while
// migration 011 has not run, so the code can be deployed first.

let ready: boolean | null = null
let checkedAt = 0

/** True once migration 011's tables exist (cached; a "no" is re-checked after a minute). */
export async function importTablesReady(): Promise<boolean> {
  if (ready || (ready === false && Date.now() - checkedAt < 60_000)) return !!ready
  try {
    const r = await pool.query(`SELECT to_regclass('nuvho_kb.article_imports') IS NOT NULL AND to_regclass('nuvho_kb.import_assets') IS NOT NULL AS ok`)
    ready = !!r.rows[0]?.ok
  } catch {
    ready = false
  }
  checkedAt = Date.now()
  return ready
}

export interface ImportAssetRecord {
  position: number
  kind: 'svg' | 'image' | 'video'
  role: 'icon' | 'figure' | 'inline' | 'video'
  uploadId: string | null
  url: string | null
  sourceRef: string
  alt: string
  width: number | null
  height: number | null
  error: string | null
  /** SHA-256 of the stored file (lets a re-export reuse it). */
  sha256?: string | null
}

export interface ImportRecordInput {
  sourceName: string
  sourceKind: 'html' | 'zip' | 'paste'
  sourceSha256: string
  sourceBytes: number
  sourceHtml: string
  title: string
  description: string
  importedHtml: string
  notes: string[]
  importerVersion: string
  via: 'editor' | 'token'
  createdBy: string
  assets: ImportAssetRecord[]
}

/** Saves an import and its assets in one transaction. Returns its id, or null before migration 011. */
export async function recordImport(input: ImportRecordInput): Promise<string | null> {
  if (!(await importTablesReady())) return null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(
      `INSERT INTO nuvho_kb.article_imports
         (source_name, source_kind, source_sha256, source_bytes, source_html, title, description,
          imported_html, notes, importer_version, via, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12) RETURNING id`,
      [input.sourceName.slice(0, 500), input.sourceKind, input.sourceSha256, input.sourceBytes, input.sourceHtml,
       input.title, input.description, input.importedHtml, JSON.stringify(input.notes), input.importerVersion,
       input.via, input.createdBy],
    )
    const id: string = r.rows[0].id
    for (const a of input.assets) {
      await client.query(
        `INSERT INTO nuvho_kb.import_assets
           (import_id, position, kind, role, upload_id, url, source_ref, alt, width, height, error, content_sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, a.position, a.kind, a.role, a.uploadId, a.url, a.sourceRef.slice(0, 1000), a.alt.slice(0, 1000),
         a.width, a.height, a.error?.slice(0, 500) ?? null, a.sha256 ?? null],
      )
    }
    await client.query('COMMIT')
    return id
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Links an import to the article it was saved into (inside the save's transaction).
 * Only an unattached import, or one already on this article, is linked. Returns the import's
 * source name when linked (for the version's change summary), or null.
 */
export async function attachImport(db: Db, importId: unknown, articleId: number): Promise<string | null> {
  if (typeof importId !== 'string' || !UUID.test(importId)) return null
  if (!(await importTablesReady())) return null
  const r = await db.query(
    `UPDATE nuvho_kb.article_imports SET article_id = $2, attached_at = COALESCE(attached_at, NOW())
      WHERE id = $1 AND (article_id IS NULL OR article_id = $2)
      RETURNING source_name`,
    [importId, articleId],
  )
  return r.rows[0]?.source_name ?? null
}

export interface ArticleImportInfo {
  id: string
  sourceName: string
  sourceKind: string
  via: string
  createdBy: string
  createdAt: string
  notes: string[]
  importerVersion: string
}

export interface ArticleAsset extends ImportAssetRecord {
  importId: string
  importedAt: string
  replacedAt: string | null
  replacedBy: string | null
}

/** The article's imports (newest first) and every asset they brought. */
export async function getArticleImports(articleId: number): Promise<{ imports: ArticleImportInfo[]; assets: ArticleAsset[] } | null> {
  if (!(await importTablesReady())) return null
  const imports = await pool.query(
    `SELECT id, source_name, source_kind, via, created_by, created_at, notes, importer_version
       FROM nuvho_kb.article_imports WHERE article_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [articleId],
  )
  const ids = imports.rows.map(r => r.id)
  const assets = ids.length
    ? await pool.query(
        `SELECT a.*, i.created_at AS imported_at FROM nuvho_kb.import_assets a
           JOIN nuvho_kb.article_imports i ON i.id = a.import_id
          WHERE a.import_id = ANY($1::uuid[])
          ORDER BY i.created_at DESC, a.position`,
        [ids],
      )
    : { rows: [] as Record<string, any>[] }
  return {
    imports: imports.rows.map(r => ({
      id: r.id, sourceName: r.source_name, sourceKind: r.source_kind, via: r.via, createdBy: r.created_by,
      createdAt: new Date(r.created_at).toISOString(), notes: Array.isArray(r.notes) ? r.notes : [],
      importerVersion: r.importer_version,
    })),
    assets: assets.rows.map(r => ({
      importId: r.import_id, position: r.position, kind: r.kind, role: r.role, uploadId: r.upload_id, url: r.url,
      sourceRef: r.source_ref, alt: r.alt, width: r.width, height: r.height, error: r.error,
      importedAt: new Date(r.imported_at).toISOString(),
      replacedAt: r.replaced_at ? new Date(r.replaced_at).toISOString() : null, replacedBy: r.replaced_by,
    })),
  }
}

/** The imported body of an article's import, with later asset replacements applied. */
export async function getImportedHtml(articleId: number, importId: string): Promise<{ html: string; title: string; description: string } | null> {
  if (!UUID.test(importId) || !(await importTablesReady())) return null
  const r = await pool.query(
    `SELECT imported_html, title, description FROM nuvho_kb.article_imports WHERE id = $1 AND article_id = $2`,
    [importId, articleId],
  )
  if (!r.rowCount) return null
  let html: string = r.rows[0].imported_html
  // A replaced asset's original URL in the stored body → its replacement
  const swaps = await pool.query(
    `SELECT o.id AS old_id, o.ext AS old_ext, a.url FROM nuvho_kb.import_assets a
       JOIN nuvho_kb.uploads o ON o.id = a.original_upload_id
      WHERE a.import_id = $1 AND a.original_upload_id IS NOT NULL AND a.url IS NOT NULL`,
    [importId],
  )
  for (const s of swaps.rows) html = html.split(`/uploads/${s.old_id}.${s.old_ext}`).join(s.url)
  return { html, title: r.rows[0].title, description: r.rows[0].description }
}

/** An earlier imported copy of exactly these bytes, still stored (re-exports reuse it). */
export async function findImportedUpload(sha256: string, mime: string): Promise<{ uploadId: string; url: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(sha256) || !(await importTablesReady())) return null
  const r = await pool.query(
    `SELECT a.upload_id, a.url FROM nuvho_kb.import_assets a
       JOIN nuvho_kb.uploads u ON u.id = a.upload_id
      WHERE a.content_sha256 = $1 AND u.mime = $2 AND a.url IS NOT NULL
      LIMIT 1`,
    [sha256, mime],
  )
  return r.rows[0] ? { uploadId: r.rows[0].upload_id, url: r.rows[0].url } : null
}

/** The kind of one of the article's imported assets (null if it is not the article's). */
export async function getImportAssetKind(articleId: number, importId: string, position: number): Promise<ImportAssetRecord['kind'] | null> {
  if (!UUID.test(importId) || !(await importTablesReady())) return null
  const r = await pool.query(
    `SELECT a.kind FROM nuvho_kb.import_assets a JOIN nuvho_kb.article_imports i ON i.id = a.import_id
      WHERE a.import_id = $1 AND i.article_id = $2 AND a.position = $3`,
    [importId, articleId, position],
  )
  return r.rows[0]?.kind ?? null
}

/** Points an imported asset at a replacement upload (keeps the first file as the original). */
export async function replaceImportAsset(
  articleId: number, importId: string, position: number,
  next: { uploadId: string; url: string; mime: string; width?: number; height?: number }, by: string,
): Promise<{ oldUrl: string | null } | null> {
  if (!UUID.test(importId) || !(await importTablesReady())) return null
  const r = await pool.query(
    `UPDATE nuvho_kb.import_assets a
        SET original_upload_id = COALESCE(a.original_upload_id, a.upload_id),
            upload_id = $4, url = $5, width = $6, height = $7, error = NULL,
            replaced_by = $8, replaced_at = NOW(), kind = $9
       FROM nuvho_kb.article_imports i, (SELECT url AS old_url FROM nuvho_kb.import_assets WHERE import_id = $1 AND position = $3) old
      WHERE a.import_id = i.id AND i.id = $1 AND i.article_id = $2 AND a.position = $3
      RETURNING old.old_url`,
    [importId, articleId, position, next.uploadId, next.url, next.width ?? null, next.height ?? null, by,
     next.mime === 'video/mp4' ? 'video' : next.mime === 'image/svg+xml' ? 'svg' : 'image'],
  )
  return r.rowCount ? { oldUrl: r.rows[0].old_url ?? null } : null
}

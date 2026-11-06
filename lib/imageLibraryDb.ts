import pool from './db'
import type { LibraryImage } from './imageLibrary'

// Server-only read of nuvho_kb.image_library (scripts/008_image_library.sql).

/** Postgres undefined_table: 008_image_library.sql has not been applied on this database. */
export function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01'
}

/** Active images, ordered by collection then title. Throws if the table is missing. */
export async function listLibraryImages(): Promise<LibraryImage[]> {
  const r = await pool.query(
    `SELECT id, collection, title, credit, width, height, url, thumb_url
       FROM nuvho_kb.image_library
      WHERE active
      ORDER BY collection, title`,
  )
  return r.rows.map(row => ({
    id: row.id,
    collection: row.collection,
    title: row.title,
    credit: row.credit,
    width: row.width,
    height: row.height,
    url: row.url,
    thumbUrl: row.thumb_url,
  }))
}

/**
 * Whether "Choose from library" should be offered. There is no env flag: the option appears
 * by itself once 008_image_library.sql is applied AND the import has stored at least one
 * active photo. Never throws, so the Edit page renders as before on a database without the
 * table (or if this check fails for any other reason).
 */
export async function hasLibraryImages(): Promise<boolean> {
  try {
    const r = await pool.query(`SELECT EXISTS (SELECT 1 FROM nuvho_kb.image_library WHERE active) AS has`)
    return r.rows[0]?.has === true
  } catch (err) {
    if (!isMissingTable(err)) console.error('[imageLibrary] availability check failed', err)
    return false
  }
}

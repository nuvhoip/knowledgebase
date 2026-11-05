import pool from './db'
import type { LibraryImage } from './imageLibrary'

// Server-only read of nuvho_kb.image_library (scripts/008_image_library.sql).

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

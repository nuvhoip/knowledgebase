import { randomBytes } from 'crypto'
import pool from './db'
import { getFileStore } from './fileStoreInstance'

// Upload storage — decision 2026-11-09 (replaces the 2026-09-25 database store).
// Image files live in a file store (lib/fileStore.mjs): plain files on the file server over
// SFTP in production, a local folder in development. Postgres keeps one metadata row per
// image in nuvho_kb.uploads (id, ext, mime, size, uploaded_by, created_at) — no image bytes.
// Images are served by app/uploads/[...path]/route.ts at /uploads/<id>.<ext>, the same URLs
// as before, so article HTML and nuvho_kb.image_library did not change.

export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 10)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
export const UPLOADS_URL_PREFIX = '/uploads'

/** Accepted types → file extension. Images (decision 2026-09-24), plus SVG drawings and MP4
 *  video (decision 2026-11-24, imported assets). SVG is only ever stored after
 *  lib/svgSanitize.ts has cleaned it (lib/assetStore.ts), never as uploaded.
 *  To accept PDFs later add `'application/pdf': 'pdf'` here, a branch in sniffType(),
 *  and the type in lib/fileStore.mjs CONTENT_TYPES. */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg':    'jpg',
  'image/png':     'png',
  'image/webp':    'webp',
  'image/gif':     'gif',
  'image/svg+xml': 'svg',
  'video/mp4':     'mp4',
}

/** Raster images: what the editor's image picker and the hero field accept. */
export const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** MP4 cap (decision 2026-11-24: 100 MB, the most Cloudflare lets through on most plans). */
export const MAX_VIDEO_MB = Math.max(1, Math.min(100, Number(process.env.MAX_VIDEO_MB) || 100))
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
export const MAX_SVG_UPLOAD_BYTES = 2 * 1024 * 1024

/** Largest file accepted for a type. */
export function maxBytesFor(mime: string): number {
  if (mime === 'video/mp4') return MAX_VIDEO_BYTES
  if (mime === 'image/svg+xml') return MAX_SVG_UPLOAD_BYTES
  return MAX_UPLOAD_BYTES
}

/** ISO base media brands that are MP4 video we can play (not HEIC/AVIF stills or QuickTime). */
const MP4_BRANDS = /^(isom|iso[2-9]|mp41|mp42|mp4v|avc1|dash|M4V |M4VH|M4VP|f4v |MSNV|NDAS|3gp[4-6])$/

/** Detect the real type from magic bytes — the client-supplied MIME is never trusted. */
export function sniffType(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  const gif = buf.subarray(0, 6).toString('ascii')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp' && MP4_BRANDS.test(buf.subarray(8, 12).toString('latin1'))) return 'video/mp4'
  if (looksLikeSvg(buf)) return 'image/svg+xml'
  return null
}

/** Text whose first element (after an XML declaration, comments or a doctype) is <svg>. */
export function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.subarray(0, 4096).toString('utf8').replace(/^﻿/, '')
  const rest = head.replace(/^\s*(?:<\?xml[^>]*\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*/i, '')
  return /^<svg[\s>]/i.test(rest)
}

// ─── Identifiers and keys ───────────────────────────────────────────────────

/** <base36 ms timestamp>-<12 hex> — sortable by upload time, unguessable enough for public URLs. */
export function newUploadId(): string {
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
}

/** File-store key for a URL path below /uploads/. Accepts <id>.<ext> and, for files saved by
 *  the old local backend, <yyyy>/<mm>/<id>.<ext>. Anything else is null (→ 404). */
const KEY_RE = /^(?:\d{4}\/\d{2}\/)?([a-z0-9]+-[a-f0-9]{12})\.(jpg|png|webp|gif|svg|mp4)$/
export function uploadKeyFromSegments(segments: string[]): string | null {
  const key = segments.join('/')
  return KEY_RE.test(key) ? key : null
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export interface SavedUpload {
  /** URL to reference from article HTML, e.g. /uploads/mufkdhhk-e8018adae9d2.png */
  url: string
  filename: string
  /** Which file store took it: 'sftp' in production, 'local' in development. */
  backend: 'sftp' | 'local'
  id: string
}

/** Saves the file first, then its metadata row. If the row cannot be added, the file is
 *  removed again, so neither exists without the other. Storage failures throw the
 *  fileStore errors (see storageFailure()). */
export async function saveUpload(buf: Buffer, mime: string, uploadedBy?: string): Promise<SavedUpload> {
  const ext = ALLOWED_TYPES[mime]
  if (!ext) throw new Error(`Unsupported type ${mime}`)
  const store = getFileStore()
  const id = newUploadId()
  const filename = `${id}.${ext}`

  await store.put(filename, buf)
  try {
    await pool.query(
      `INSERT INTO nuvho_kb.uploads (id, ext, mime, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, ext, mime, buf.length, uploadedBy ?? null],
    )
  } catch (err) {
    await store.remove(filename).catch(e => console.error('[uploads] could not remove orphan file', filename, e))
    throw err
  }
  return { url: `${UPLOADS_URL_PREFIX}/${filename}`, filename, backend: store.driver, id }
}

// ─── Transition: images still held in Postgres ─────────────────────────────────
//
// Until migration 010 drops nuvho_kb.uploads.data, an image that is not (yet) in the file
// store is served from its old database row, so deploying this code and copying the files
// (scripts/migrate-uploads-to-files.mjs) can happen in either order. Once the column is
// gone the first lookup notices (42703) and the fallback switches itself off.

let dbFallback = true

export interface LegacyUpload {
  mime: string
  data: Buffer
  size: number
  createdAt: Date
}

export async function readLegacyUpload(key: string): Promise<LegacyUpload | null> {
  if (!dbFallback) return null
  const m = key.match(KEY_RE)
  if (!m || key.includes('/')) return null
  const [, id, ext] = m
  try {
    const r = await pool.query(
      'SELECT mime, ext, data, size_bytes, created_at FROM nuvho_kb.uploads WHERE id = $1 AND data IS NOT NULL',
      [id],
    )
    if (r.rowCount === 0 || r.rows[0].ext !== ext) return null
    const row = r.rows[0]
    return { mime: row.mime, data: row.data, size: row.size_bytes, createdAt: row.created_at }
  } catch (err) {
    if ((err as { code?: string }).code === '42703') {
      dbFallback = false   // column dropped by migration 010: files only from now on
      return null
    }
    throw err
  }
}

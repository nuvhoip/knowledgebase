import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import pool from './db'

// Upload storage — decision 2026-09-25: editor images live in the existing nuvho_kb
// Postgres database (table nuvho_kb.uploads, migration scripts/005_uploads.sql) and are
// served by app/uploads/[...path]/route.ts at /uploads/<id>.<ext>.
//
// Why the database: knowledge.nuvho.com runs on DigitalOcean App Platform, whose
// containers have no persistent disk, and a paid object store was ruled out. Cloudflare
// fronts the site and caches image extensions, so each image is read from Postgres about
// once per edge location; images also travel with the articles in every DB backup.
//
// UPLOAD_STORAGE=local switches to disk under UPLOADS_DIR (for a plain Docker host with a
// volume). Local URLs are /uploads/<yyyy>/<mm>/<id>.<ext>; the serving route handles both.

export type StorageBackend = 'db' | 'local'

export function storageBackend(): StorageBackend {
  return process.env.UPLOAD_STORAGE === 'local' ? 'local' : 'db'
}

export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 10)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
export const UPLOADS_URL_PREFIX = '/uploads'

/** Local backend: on-disk root. */
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads'))

/** Accepted types → file extension. Images only (decision 2026-09-24).
 *  To accept PDFs later add `'application/pdf': 'pdf'` here and a branch in sniffType(). */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

/** Extension → Content-Type for the local serving path. */
export const CONTENT_TYPES: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  gif:  'image/gif',
}

/** Detect the real type from magic bytes — the client-supplied MIME is never trusted. */
export function sniffType(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  const gif = buf.subarray(0, 6).toString('ascii')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  return null
}

// ─── Identifiers ─────────────────────────────────────────────────────────────

/** <base36 ms timestamp>-<12 hex> — sortable by upload time, unguessable enough for public URLs. */
function newId(): string {
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
}
const FILENAME_RE = /^([a-z0-9]+-[a-f0-9]{12})\.([a-z0-9]{2,5})$/i

// ─── Save ─────────────────────────────────────────────────────────────────────

export interface SavedUpload {
  /** URL to reference from article HTML, e.g. /uploads/mufkdhhk-e8018adae9d2.png */
  url: string
  filename: string
  backend: StorageBackend
  id: string
}

export async function saveUpload(buf: Buffer, mime: string, uploadedBy?: string): Promise<SavedUpload> {
  const ext = ALLOWED_TYPES[mime]
  if (!ext) throw new Error(`Unsupported type ${mime}`)
  const id = newId()
  const filename = `${id}.${ext}`

  if (storageBackend() === 'db') {
    await pool.query(
      `INSERT INTO nuvho_kb.uploads (id, ext, mime, size_bytes, data, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, ext, mime, buf.length, buf, uploadedBy ?? null],
    )
    return { url: `${UPLOADS_URL_PREFIX}/${filename}`, filename, backend: 'db', id }
  }

  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dir = path.join(UPLOADS_DIR, yyyy, mm)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), buf, { flag: 'wx' })
  return { url: `${UPLOADS_URL_PREFIX}/${yyyy}/${mm}/${filename}`, filename, backend: 'local', id }
}

// ─── Read (DB backend) ───────────────────────────────────────────────────────

export interface StoredUpload {
  mime: string
  data: Buffer
  size: number
  createdAt: Date
}

/** Fetch one stored image by its URL filename (<id>.<ext>). Null when the name is malformed,
 *  unknown, or the extension does not match the stored one. */
export async function readUpload(filename: string): Promise<StoredUpload | null> {
  const m = filename.match(FILENAME_RE)
  if (!m) return null
  const [, id, ext] = m
  const r = await pool.query(
    'SELECT mime, ext, data, size_bytes, created_at FROM nuvho_kb.uploads WHERE id = $1',
    [id],
  )
  if (r.rowCount === 0) return null
  const row = r.rows[0]
  if (row.ext !== ext.toLowerCase()) return null
  return { mime: row.mime, data: row.data, size: row.size_bytes, createdAt: row.created_at }
}

// ─── Local backend path guard ────────────────────────────────────────────────

/** Map URL segments back to a file inside UPLOADS_DIR. Returns null on any traversal attempt
 *  or unexpected character — segments may only be [a-z0-9][a-z0-9._-]*. */
export function resolveUploadPath(segments: string[]): string | null {
  if (!segments.length || segments.some(s => !/^[a-z0-9][a-z0-9._-]*$/i.test(s))) return null
  const full = path.resolve(UPLOADS_DIR, ...segments)
  const rel = path.relative(UPLOADS_DIR, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

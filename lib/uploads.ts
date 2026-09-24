import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

// Upload storage — local disk (decision 2026-09-24: Docker named volume on servermain).
// UPLOADS_DIR is the on-disk root. Files are written to <root>/<yyyy>/<mm>/<random>.<ext>
// and served back at /uploads/<yyyy>/<mm>/<random>.<ext> by app/uploads/[...path]/route.ts.
// Filenames are random, so responses can be cached as immutable.

export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads'))
export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 10)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
export const UPLOADS_URL_PREFIX = '/uploads'

/** Accepted types → file extension. Images only (decision 2026-09-24).
 *  To accept PDFs later add `'application/pdf': 'pdf'` here and a branch in sniffType(). */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

/** Extension → Content-Type for the serving route. */
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

export interface SavedUpload {
  /** Public URL path, e.g. /uploads/2026/09/m1abc-0f3a9c.jpg */
  url: string
  /** Absolute path on disk */
  path: string
  filename: string
}

export async function saveUpload(buf: Buffer, mime: string): Promise<SavedUpload> {
  const ext = ALLOWED_TYPES[mime]
  if (!ext) throw new Error(`Unsupported type ${mime}`)
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const filename = `${now.getTime().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`
  const dir = path.join(UPLOADS_DIR, yyyy, mm)
  await fs.mkdir(dir, { recursive: true })
  const full = path.join(dir, filename)
  await fs.writeFile(full, buf, { flag: 'wx' })
  return { url: `${UPLOADS_URL_PREFIX}/${yyyy}/${mm}/${filename}`, path: full, filename }
}

/** Map URL segments back to a file inside UPLOADS_DIR. Returns null on any traversal attempt
 *  or unexpected character — segments may only be [a-z0-9] followed by [a-z0-9._-]. */
export function resolveUploadPath(segments: string[]): string | null {
  if (!segments.length || segments.some(s => !/^[a-z0-9][a-z0-9._-]*$/i.test(s))) return null
  const full = path.resolve(UPLOADS_DIR, ...segments)
  const rel = path.relative(UPLOADS_DIR, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

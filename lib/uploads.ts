import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Upload storage adapter — two backends, chosen by environment (decision 2026-09-25):
//
//   spaces  DigitalOcean Spaces (S3 API + CDN). Used when SPACES_BUCKET, SPACES_KEY and
//           SPACES_SECRET are all set. Production on App Platform must use this: its
//           containers have no persistent disk, so anything written locally is lost on
//           the next deploy. Objects are public-read at <prefix>/<yyyy>/<mm>/<random>.<ext>
//           and referenced by their CDN URL.
//   local   Disk under UPLOADS_DIR, served by app/uploads/[...path]/route.ts. Local dev
//           default, and the right choice on a plain Docker host with a volume.
//
// Filenames are random per upload, so both backends can cache responses as immutable.

export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 10)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

/** Accepted types → file extension. Images only (decision 2026-09-24).
 *  To accept PDFs later add `'application/pdf': 'pdf'` here and a branch in sniffType(). */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

/** Extension → Content-Type for the local serving route. */
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

// ─── Backend selection ────────────────────────────────────────────────────────

export type StorageBackend = 'spaces' | 'local'

const SPACES = {
  bucket: process.env.SPACES_BUCKET ?? '',
  region: process.env.SPACES_REGION ?? 'syd1',
  key:    process.env.SPACES_KEY ?? '',
  secret: process.env.SPACES_SECRET ?? '',
  /** CDN or custom-domain base, e.g. https://nuvho-kb.syd1.cdn.digitaloceanspaces.com */
  cdnUrl: (process.env.SPACES_CDN_URL ?? '').replace(/\/+$/, ''),
  prefix: (process.env.SPACES_PREFIX ?? 'uploads').replace(/^\/+|\/+$/g, ''),
}

export function storageBackend(): StorageBackend {
  return SPACES.bucket && SPACES.key && SPACES.secret ? 'spaces' : 'local'
}

/** Local backend: on-disk root and the URL prefix the serving route answers on. */
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads'))
export const UPLOADS_URL_PREFIX = '/uploads'

let s3: S3Client | null = null
function s3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      // Spaces ignores the region name but the SDK requires one; the endpoint carries the real region.
      region: 'us-east-1',
      endpoint: `https://${SPACES.region}.digitaloceanspaces.com`,
      forcePathStyle: false,
      credentials: { accessKeyId: SPACES.key, secretAccessKey: SPACES.secret },
    })
  }
  return s3
}

function spacesPublicBase(): string {
  return SPACES.cdnUrl || `https://${SPACES.bucket}.${SPACES.region}.digitaloceanspaces.com`
}

function newObjectName(ext: string): { yyyy: string; mm: string; filename: string } {
  const now = new Date()
  return {
    yyyy: String(now.getUTCFullYear()),
    mm: String(now.getUTCMonth() + 1).padStart(2, '0'),
    filename: `${now.getTime().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`,
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export interface SavedUpload {
  /** URL to reference from article HTML: absolute CDN URL (spaces) or /uploads/… (local). */
  url: string
  filename: string
  backend: StorageBackend
  /** Object key (spaces) or path relative to UPLOADS_DIR (local). */
  key: string
}

export async function saveUpload(buf: Buffer, mime: string): Promise<SavedUpload> {
  const ext = ALLOWED_TYPES[mime]
  if (!ext) throw new Error(`Unsupported type ${mime}`)
  const { yyyy, mm, filename } = newObjectName(ext)

  if (storageBackend() === 'spaces') {
    const key = `${SPACES.prefix}/${yyyy}/${mm}/${filename}`
    await s3Client().send(new PutObjectCommand({
      Bucket: SPACES.bucket,
      Key: key,
      Body: buf,
      ContentType: mime,
      ContentLength: buf.length,
      ACL: 'public-read',
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    return { url: `${spacesPublicBase()}/${key}`, filename, backend: 'spaces', key }
  }

  const dir = path.join(UPLOADS_DIR, yyyy, mm)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), buf, { flag: 'wx' })
  const key = `${yyyy}/${mm}/${filename}`
  return { url: `${UPLOADS_URL_PREFIX}/${key}`, filename, backend: 'local', key }
}

/** Local backend only: map URL segments back to a file inside UPLOADS_DIR. Returns null on
 *  any traversal attempt or unexpected character — segments may only be [a-z0-9][a-z0-9._-]*. */
export function resolveUploadPath(segments: string[]): string | null {
  if (!segments.length || segments.some(s => !/^[a-z0-9][a-z0-9._-]*$/i.test(s))) return null
  const full = path.resolve(UPLOADS_DIR, ...segments)
  const rel = path.relative(UPLOADS_DIR, full)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

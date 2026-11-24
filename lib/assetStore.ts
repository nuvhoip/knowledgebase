import { cleanSvg, type CleanSvgOptions } from '@/lib/svgSanitize'
import { embedBrandFonts } from '@/lib/svgFonts'
import { maxBytesFor, MAX_VIDEO_BYTES, MAX_UPLOAD_BYTES, RASTER_TYPES, saveUpload, sniffType } from '@/lib/uploads'
import { fetchRemote, RemoteFetchError } from '@/lib/remoteFetch'
import { createHash } from 'crypto'

// Stores one asset of an imported page (or a file picked in the Assets panel) as an upload.
// Every path ends in saveUpload() (lib/uploads.ts) with a type sniffed from the bytes; SVG
// is always cleaned (lib/svgSanitize.ts) and given its brand fonts (lib/svgFonts.ts) first.

export interface StoredAsset {
  uploadId: string
  url: string
  mime: string
  width?: number
  height?: number
  /** Alt text found in the drawing (<title>), when the page gave none. */
  alt?: string
  /** Which file store took it: 'sftp' in production, 'local' in development. */
  backend: 'sftp' | 'local'
  /** SHA-256 of the stored bytes. */
  sha256: string
  /** True when an identical earlier file was reused instead of stored again. */
  reused?: boolean
}

/** Finds an earlier stored copy of the same bytes (re-exports of the same page). */
export type ReuseLookup = (sha256: string, mime: string) => Promise<{ uploadId: string; url: string } | null>

async function persist(buf: Buffer, mime: string, by: string, reuse?: ReuseLookup): Promise<Pick<StoredAsset, 'uploadId' | 'url' | 'backend' | 'sha256' | 'reused'>> {
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const hit = reuse ? await reuse(sha256, mime).catch(() => null) : null
  if (hit) return { uploadId: hit.uploadId, url: hit.url, backend: 'sftp', sha256, reused: true }
  const saved = await saveUpload(buf, mime, by)
  return { uploadId: saved.id, url: saved.url, backend: saved.backend, sha256 }
}

export class AssetError extends Error {}

function mb(bytes: number): string {
  return `${Math.round(bytes / 1048576)} MB`
}

/** Cleans an SVG, embeds its brand fonts and stores it. */
export async function storeSvg(source: string, by: string, defaults?: CleanSvgOptions, reuse?: ReuseLookup): Promise<StoredAsset> {
  const clean = cleanSvg(source, defaults)
  if (!clean) throw new AssetError('The drawing is empty, too large or not valid SVG.')
  const { svg } = await embedBrandFonts(clean.svg)
  const saved = await persist(Buffer.from(svg, 'utf8'), 'image/svg+xml', by, reuse)
  return {
    ...saved, mime: 'image/svg+xml',
    width: clean.width, height: clean.height, alt: clean.title || clean.desc || undefined,
  }
}

export type Accept = 'image' | 'video' | 'any'

/** Stores bytes whose type is sniffed; SVG goes through storeSvg. */
export async function storeBytes(buf: Buffer, by: string, accept: Accept, defaults?: CleanSvgOptions, reuse?: ReuseLookup): Promise<StoredAsset> {
  if (!buf.length) throw new AssetError('The file is empty.')
  const mime = sniffType(buf)
  if (!mime) throw new AssetError('Not a supported file (JPG, PNG, WebP, GIF, SVG or MP4).')
  if (mime === 'image/svg+xml') {
    if (accept === 'video') throw new AssetError('Expected an MP4 video.')
    return storeSvg(buf.toString('utf8'), by, defaults, reuse)
  }
  const isVideo = mime === 'video/mp4'
  if (accept === 'image' && isVideo) throw new AssetError('Expected an image, got a video.')
  if (accept === 'video' && !isVideo) throw new AssetError('Expected an MP4 video.')
  if (!isVideo && !RASTER_TYPES.includes(mime)) throw new AssetError('Not a supported image type.')
  const max = maxBytesFor(mime)
  if (buf.length > max) throw new AssetError(`${isVideo ? 'Videos' : 'Images'} must be ${mb(max)} or smaller.`)
  const saved = await persist(buf, mime, by, reuse)
  return { ...saved, mime, ...imageSize(buf, mime) }
}

/** data:[mime][;base64],payload → bytes. */
export function decodeDataUri(uri: string): Buffer {
  const m = /^data:([^,]*?),([\s\S]*)$/i.exec(uri.trim())
  if (!m) throw new AssetError('Not a valid data: URI.')
  const base64 = /;base64$/i.test(m[1])
  try {
    return base64 ? Buffer.from(m[2].replace(/\s+/g, ''), 'base64') : Buffer.from(decodeURIComponent(m[2]), 'utf8')
  } catch {
    throw new AssetError('The embedded data could not be decoded.')
  }
}

/** Downloads a linked image (or video) and stores the copy. */
export async function storeRemote(url: string, by: string, accept: Accept, defaults?: CleanSvgOptions, reuse?: ReuseLookup): Promise<StoredAsset> {
  try {
    const got = await fetchRemote(url, { maxBytes: accept === 'video' ? MAX_VIDEO_BYTES : Math.max(MAX_UPLOAD_BYTES, 2 * 1048576) })
    return await storeBytes(got.body, by, accept, defaults, reuse)
  } catch (err) {
    if (err instanceof RemoteFetchError) throw new AssetError(`Could not copy it: ${err.message}.`)
    throw err
  }
}

/** Intrinsic size of PNG / GIF / JPEG / WebP from the header, so the <img> reserves its space. */
export function imageSize(buf: Buffer, mime: string): { width?: number; height?: number } {
  try {
    if (mime === 'image/png' && buf.length > 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    if (mime === 'image/gif' && buf.length > 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    if (mime === 'image/webp' && buf.length > 30) {
      const kind = buf.subarray(12, 16).toString('ascii')
      if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
      if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
      if (kind === 'VP8L') {
        const b = buf.readUInt32LE(21)
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
      }
    }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        const len = buf.readUInt16BE(i + 2)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        i += 2 + len
      }
    }
  } catch { /* unknown layout: no size */ }
  return {}
}

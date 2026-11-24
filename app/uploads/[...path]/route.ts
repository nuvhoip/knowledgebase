import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { getFileStore } from '@/lib/fileStoreInstance'
import { StorageUnavailableError } from '@/lib/fileStore.mjs'
import { readLegacyUpload, uploadKeyFromSegments } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { path: string[] }
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const NO_STORE = 'no-store'

// Imported SVG drawings are cleaned before they are stored (lib/svgSanitize.ts). Inside an
// <img> an SVG never runs scripts; opened directly it could, so it also gets a CSP that allows
// nothing but its own inline styles and embedded fonts/images, and a sandbox.
const SVG_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; sandbox",
  'Content-Disposition': 'inline',
}

/** One "bytes=a-b" range. null = no usable range (serve the whole file); 'invalid' = 416. */
function parseRange(header: string, size: number): { start: number; end: number } | null | 'invalid' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2])) return null           // multiple or malformed ranges: whole file
  let start: number
  let end: number
  if (!m[1]) {                                        // suffix: the last N bytes
    const n = Number(m[2])
    if (!n) return 'invalid'
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/** GET /uploads/<id>.<ext>  (and <yyyy>/<mm>/<id>.<ext> from the old local backend)
 *
 *  Streams the image from the file store (lib/fileStore.mjs: SFTP to the file server in
 *  production). Names are random per upload, so responses are cached as immutable and
 *  Cloudflare in front of knowledge.nuvho.com serves repeat requests from its edge.
 *  Uploads are public once an article is published, so there is no session check.
 *  Errors are never cached, so a file that arrives later (or storage that recovers) shows up. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const key = uploadKeyFromSegments(params.path)
  if (!key) return notFound()

  const etag = `"${key.split('/').pop()}"`
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': IMMUTABLE } })
  }

  let storeError: unknown = null
  try {
    const store = getFileStore()
    // Video needs byte ranges: browsers (Safari above all) seek and start playback with them
    const rangeHeader = req.headers.get('range')
    let range: { start: number; end: number } | undefined
    if (rangeHeader) {
      const info = await store.head(key)
      // Not in the file store: ignore the range and let the legacy fallback below try
      const parsed = info ? parseRange(rangeHeader, info.contentLength) : null
      if (info && parsed === 'invalid') {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.contentLength}`, 'Cache-Control': NO_STORE },
        })
      }
      range = parsed && parsed !== 'invalid' ? parsed : undefined
    }
    const file = await store.get(key, range)
    if (file) {
      file.body.on('error', err => console.error('[uploads GET] stream failed', key, err))
      const headers: Record<string, string> = {
        'Content-Type': file.contentType,
        'Content-Length': String(range ? range.end - range.start + 1 : file.contentLength),
        'Last-Modified': file.modified.toUTCString(),
        ETag: etag,
        'Cache-Control': IMMUTABLE,
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        ...(key.endsWith('.svg') ? SVG_HEADERS : {}),
      }
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.contentLength}`
      return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
        status: range ? 206 : 200,
        headers,
      })
    }
  } catch (err) {
    storeError = err
    console.error('[uploads GET] file store', key, err)
  }

  // Transition only: the image may still be in its old database row (see lib/uploads.ts)
  try {
    const legacy = await readLegacyUpload(key)
    if (legacy) {
      return new NextResponse(new Uint8Array(legacy.data), {
        headers: {
          'Content-Type': legacy.mime,
          'Content-Length': String(legacy.size),
          'Last-Modified': legacy.createdAt.toUTCString(),
          ETag: etag,
          'Cache-Control': IMMUTABLE,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
  } catch (err) {
    console.error('[uploads GET] database fallback', key, err)
  }

  if (storeError) {
    const unavailable = storeError instanceof StorageUnavailableError
    return new NextResponse(unavailable ? 'Image storage is unavailable' : 'Could not read the image', {
      status: unavailable ? 502 : 500,
      headers: { 'Cache-Control': NO_STORE },
    })
  }
  return notFound()
}

function notFound() {
  return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': NO_STORE } })
}

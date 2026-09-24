import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { CONTENT_TYPES, readUpload, resolveUploadPath } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { path: string[] }
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

/** GET /uploads/<id>.<ext>            — image stored in Postgres (default backend)
 *  GET /uploads/<yyyy>/<mm>/<file>    — image on local disk (UPLOAD_STORAGE=local)
 *
 *  Names are random per upload, so responses are cached as immutable; Cloudflare in front
 *  of knowledge.nuvho.com caches image extensions at the edge, so Postgres is read rarely.
 *  Uploads are public once an article is published, so there is no session check. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const segments = params.path

  if (segments.length === 1) {
    const etag = `"${segments[0]}"`
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': IMMUTABLE } })
    }
    const stored = await readUpload(segments[0]).catch(err => {
      console.error('[uploads GET]', err)
      return null
    })
    if (!stored) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(stored.data), {
      headers: {
        'Content-Type': stored.mime,
        'Content-Length': String(stored.size),
        'Last-Modified': stored.createdAt.toUTCString(),
        ETag: etag,
        'Cache-Control': IMMUTABLE,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Local backend
  const full = resolveUploadPath(segments)
  if (!full) return new NextResponse('Not found', { status: 404 })
  const type = CONTENT_TYPES[path.extname(full).slice(1).toLowerCase()]
  if (!type) return new NextResponse('Not found', { status: 404 })
  try {
    const [buf, stat] = await Promise.all([fs.readFile(full), fs.stat(full)])
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': type,
        'Content-Length': String(stat.size),
        'Last-Modified': stat.mtime.toUTCString(),
        'Cache-Control': IMMUTABLE,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

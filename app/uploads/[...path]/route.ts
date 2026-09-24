import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { CONTENT_TYPES, resolveUploadPath } from '@/lib/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { path: string[] }
}

/** GET /uploads/<yyyy>/<mm>/<file> — serves editor uploads from UPLOADS_DIR.
 *  Next.js only serves `public/` files that existed at build time, so runtime uploads
 *  need this route. nginx may alias the same directory in front of it for speed.
 *  Uploads are public once an article is published, so there is no session check. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const full = resolveUploadPath(params.path)
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
        // Filenames are random per upload, so the content behind a URL never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { MAX_UPLOAD_MB, MAX_VIDEO_BYTES, MAX_VIDEO_MB } from '@/lib/uploads'
import { AssetError, storeBytes, type Accept } from '@/lib/assetStore'
import { storageFailure } from '@/lib/fileStore.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/admin/uploads
 *  multipart/form-data with one `file` field and an optional `accept` field:
 *    image (default) — JPG, PNG, WebP or GIF up to MAX_UPLOAD_MB (10): editor images, hero
 *    video           — MP4 up to MAX_VIDEO_MB (100): the editor's Media → Upload video
 *  The type is sniffed from the bytes (lib/uploads.ts), never taken from the browser.
 *  Restricted to @nuvho.com sessions, like every other write route.
 *  Returns { location, url, filename, size, type } — `location` follows the TinyMCE
 *  upload-handler convention; our own code reads `url`.
 *
 *  Deployment note: Cloudflare (and any proxy) in front of the app must allow bodies of at
 *  least MAX_VIDEO_MB, otherwise it answers 413 before we do. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Cheap early reject when the browser declares the size (allow for multipart overhead).
  const declared = Number(req.headers.get('content-length'))
  if (declared && declared > MAX_VIDEO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: `Files must be ${MAX_VIDEO_MB} MB or smaller.` }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file was included in the request.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The file is empty.' }, { status: 400 })
  }
  const accept: Accept = form.get('accept') === 'video' ? 'video' : 'image'
  if (accept === 'image' && file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Images must be ${MAX_UPLOAD_MB} MB or smaller.` }, { status: 413 })
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    // The image route keeps to raster images: an SVG here would only ever be a hero or an
    // inline picture, and drawings come in through Import (cleaned and font-embedded).
    if (accept === 'image' && buf.subarray(0, 4096).toString('utf8').match(/<svg[\s>]/i)) {
      return NextResponse.json({ error: 'Only JPG, PNG, WebP and GIF images are accepted here. Import SVG drawings with the page, or replace one in Assets.' }, { status: 415 })
    }
    const saved = await storeBytes(buf, session.email, accept)
    return NextResponse.json({
      location: saved.url,
      url: saved.url,
      filename: saved.url.split('/').pop(),
      size: buf.length,
      type: saved.mime,
      width: saved.width,
      height: saved.height,
      // 'sftp' in production, 'local' in development (lib/fileStore.mjs)
      backend: saved.backend,
    })
  } catch (err) {
    if (err instanceof AssetError) {
      const status = /must be .* or smaller/.test(err.message) ? 413 : 415
      return NextResponse.json({ error: err.message }, { status })
    }
    console.error('[admin/uploads POST]', err)
    const failure = storageFailure(err)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    return NextResponse.json({ error: 'Could not store the file on the server.' }, { status: 500 })
  }
}

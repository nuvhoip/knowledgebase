import { NextRequest, NextResponse } from 'next/server'
import { getImportAssetKind, replaceImportAsset } from '@/lib/importDb'
import { AssetError, storeBytes } from '@/lib/assetStore'
import { storageFailure } from '@/lib/fileStore.mjs'
import { MAX_VIDEO_BYTES } from '@/lib/uploads'
import { staffArticleId } from '@/lib/articleAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: { categorySlug: string; slug: string; importId: string; position: string } }

/** POST …/imports/[importId]/assets/[position] (multipart `file`) — replaces an imported asset.
 *  The new file is stored like an import (SVG cleaned and given its brand fonts); the asset
 *  record points at it and keeps the first file as the original. Returns { url, oldUrl, … };
 *  the editor swaps oldUrl for url in the content, and the author saves. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const who = await staffArticleId(params)
  if (who instanceof NextResponse) return who
  const position = Number(params.position)
  if (!Number.isInteger(position) || position < 1) return NextResponse.json({ error: 'Unknown asset.' }, { status: 404 })

  const declared = Number(req.headers.get('content-length'))
  if (declared && declared > MAX_VIDEO_BYTES + 64 * 1024) return NextResponse.json({ error: 'Files must be 100 MB or smaller.' }, { status: 413 })

  let file: FormDataEntryValue | null
  try {
    file = (await req.formData()).get('file')
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field.' }, { status: 400 })
  }
  if (!file || typeof file === 'string' || !file.size) return NextResponse.json({ error: 'No file was included.' }, { status: 400 })

  // A video is replaced by a video, a drawing or image by a drawing or image: otherwise the
  // markup around it (<video> vs <img>) would no longer fit and the sanitiser would drop it
  const kind = await getImportAssetKind(who.id, params.importId, position)
  if (!kind) return NextResponse.json({ error: 'Asset not found for this article.' }, { status: 404 })

  try {
    const stored = await storeBytes(Buffer.from(await file.arrayBuffer()), who.email, kind === 'video' ? 'video' : 'image')
    const r = await replaceImportAsset(who.id, params.importId, position, stored, who.email)
    if (!r) return NextResponse.json({ error: 'Asset not found for this article.' }, { status: 404 })
    return NextResponse.json({ url: stored.url, oldUrl: r.oldUrl, mime: stored.mime, width: stored.width, height: stored.height })
  } catch (err) {
    if (err instanceof AssetError) return NextResponse.json({ error: err.message }, { status: 415 })
    console.error('[imports asset replace]', err)
    const failure = storageFailure(err)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 })
  }
}

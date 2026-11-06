import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isMissingTable, listLibraryImages } from '@/lib/imageLibraryDb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/image-library
 *  The active photos imported from the Marketing SharePoint Image Repository
 *  (scripts/import-image-library.mjs). @nuvho.com sessions only, like the upload route.
 *  Returns { images: LibraryImage[] }; 404 until scripts/008_image_library.sql is applied. */
export async function GET() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  try {
    const images = await listLibraryImages()
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    if (isMissingTable(err)) {
      return NextResponse.json({ error: 'The image library has not been set up on this server yet.' }, { status: 404 })
    }
    console.error('[admin/image-library GET]', err)
    return NextResponse.json({ error: 'Could not load the image library.' }, { status: 500 })
  }
}

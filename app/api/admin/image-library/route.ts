import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isImageLibraryEnabled } from '@/lib/flags'
import { listLibraryImages } from '@/lib/imageLibraryDb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/image-library
 *  The active photos imported from the Marketing SharePoint Image Repository
 *  (scripts/import-image-library.mjs). @nuvho.com sessions only, like the upload route.
 *  Returns { images: LibraryImage[] }. */
export async function GET() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }
  if (!isImageLibraryEnabled()) {
    return NextResponse.json({ error: 'The image library is not switched on.' }, { status: 404 })
  }

  try {
    const images = await listLibraryImages()
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    // 42P01 = undefined_table: the flag is on but 008_image_library.sql has not been applied
    const code = (err as { code?: string }).code
    console.error('[admin/image-library GET]', err)
    return NextResponse.json(
      { error: code === '42P01' ? 'The image library has not been set up on this server yet.' : 'Could not load the image library.' },
      { status: code === '42P01' ? 503 : 500 },
    )
  }
}

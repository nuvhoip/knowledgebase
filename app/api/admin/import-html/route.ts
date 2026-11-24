import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { importArticleHtml } from '@/lib/htmlImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Big enough for a standalone page with embedded fonts and logos (the reference page is
// ~350 KB); the importer throws those away, so the article itself stays small.
const MAX_BYTES = 8 * 1024 * 1024

/** POST /api/admin/import-html
 *  JSON { html } → { title, description, html, notes } (lib/htmlImport.ts).
 *  Converts only; nothing is saved. The editor loads the result for review and the normal
 *  save path sanitises it again. Restricted to @nuvho.com sessions, like every write route. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const declared = Number(req.headers.get('content-length'))
  if (declared && declared > MAX_BYTES) {
    return NextResponse.json({ error: 'That HTML file is larger than 8 MB.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON with an "html" field.' }, { status: 400 })
  }
  const html = (body as { html?: unknown })?.html
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'The HTML is empty.' }, { status: 400 })
  }
  if (html.length > MAX_BYTES) {
    return NextResponse.json({ error: 'That HTML file is larger than 8 MB.' }, { status: 413 })
  }

  const result = importArticleHtml(html)
  if (!result.html) {
    return NextResponse.json({ error: 'No article content was found in that HTML.', notes: result.notes }, { status: 422 })
  }
  return NextResponse.json(result)
}

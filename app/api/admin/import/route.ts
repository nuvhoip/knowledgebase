import { NextRequest, NextResponse } from 'next/server'
import { getImportActor } from '@/lib/apiTokens'
import { ImportError, runImport } from '@/lib/importPipeline'
import { submitImportedArticle, type SubmitMeta } from '@/lib/importSubmit'
import { storageFailure } from '@/lib/fileStore.mjs'
import { MAX_BUNDLE_ZIPPED } from '@/lib/importBundle'
import { absoluteUrl } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Storing a page's drawings (font subsetting) and copying linked images takes a while
export const maxDuration = 300

/**
 * POST /api/admin/import — import a page with its assets (decision 24 Nov 2026, NUVCL-201).
 *
 * Who: a @nuvho.com session (the editor's Import menu), or a personal import token
 *   (Authorization: Bearer nkb_…, created in Admin → Claude tokens) — the
 *   nuvho-knowledge-save skill from Claude Code.
 *
 * Body: multipart/form-data with
 *   file  — the page (.html) or a .zip of the page and its files, up to 100 MB; or
 *   html  — the page as text (the editor's Paste HTML)
 *   mode  — 'convert' (default): store the assets and return the article for review; nothing
 *           is saved as an article. 'submit': also create / update a PENDING article.
 *   For mode=submit, optional: title, description, categorySlug, subcategorySlug,
 *   visibility (public | private), tags (comma-separated or repeated), sourceTier, sourceId,
 *   readTime. Unknown categories fall back to the Claude Inbox.
 *
 * Response: { importId, importer, title, description, tags, html, notes, assets[] } and, for
 * submit, { article: { status, categorySlug, slug, url, editUrl } }.
 */
export async function POST(req: NextRequest) {
  const actor = await getImportActor(req)
  if (!actor) {
    return NextResponse.json(
      { error: 'Sign in with a @nuvho.com account, or send a valid personal import token (Admin → Claude tokens).' },
      { status: 403 },
    )
  }

  const declared = Number(req.headers.get('content-length'))
  if (declared && declared > MAX_BUNDLE_ZIPPED + 256 * 1024) {
    return NextResponse.json({ error: 'The upload is larger than 100 MB.' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" (or "html") field.' }, { status: 400 })
  }

  const file = form.get('file')
  const pasted = form.get('html')
  let data: Buffer
  let fileName: string
  if (file && typeof file !== 'string') {
    data = Buffer.from(await file.arrayBuffer())
    fileName = (file.name || 'page.html').slice(0, 200)
  } else if (typeof pasted === 'string' && pasted.trim()) {
    data = Buffer.from(pasted, 'utf8')
    fileName = 'pasted HTML'
  } else {
    return NextResponse.json({ error: 'Nothing to import: send a "file" (.html or .zip) or an "html" field.' }, { status: 400 })
  }

  const mode = form.get('mode') === 'submit' ? 'submit' : 'convert'

  try {
    const outcome = await runImport({ data, fileName, pasted: fileName === 'pasted HTML', by: actor.email, via: actor.via })
    if (mode === 'convert') return NextResponse.json(outcome)

    const str = (k: string) => {
      const v = form.get(k)
      return typeof v === 'string' && v.trim() ? v.trim() : undefined
    }
    const visibility = str('visibility')
    const meta: SubmitMeta = {
      title: str('title'),
      description: str('description'),
      categorySlug: str('categorySlug'),
      subcategorySlug: str('subcategorySlug'),
      visibility: visibility === 'public' || visibility === 'private' ? visibility : visibility === 'internal' ? 'private' : null,
      tags: form.getAll('tags').flatMap(t => typeof t === 'string' ? t.split(',') : []).map(t => t.trim()).filter(Boolean).slice(0, 12),
      sourceTier: str('sourceTier'),
      sourceId: str('sourceId'),
      readTime: Number(str('readTime')) || undefined,
    }
    const article = await submitImportedArticle(outcome, meta, actor.email, fileName)
    if (article.status === 'refused') {
      return NextResponse.json({ ...outcome, error: article.reason, article }, { status: article.httpStatus })
    }
    return NextResponse.json({
      ...outcome,
      article: {
        ...article,
        url: absoluteUrl(`/articles/${article.categorySlug}/${article.slug}`),
        editUrl: absoluteUrl(`/articles/${article.categorySlug}/${article.slug}/edit`),
        adminUrl: absoluteUrl('/admin'),
      },
    }, { status: article.status === 'created' ? 201 : 200 })
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[admin/import]', err)
    const failure = storageFailure(err)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    return NextResponse.json({ error: 'The import failed on the server.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { VersionNotFoundError, lockArticle, restoreVersion, withDb } from '@/lib/versions'
import { parseVersion, versionAccess } from '../../access'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { categorySlug: string; slug: string; version: string }
}

/**
 * POST /api/admin/articles/[categorySlug]/[slug]/versions/[version]/restore
 * Restores the version's title, description, body and read time as a NEW version (newer
 * history is kept). Status, category and visibility are left as they are. The vector DB is
 * not touched — the editor is told to Sync again.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const access = await versionAccess(params.categorySlug, params.slug)
  if ('error' in access) return access.error
  const n = parseVersion(params.version)
  if (!n) return NextResponse.json({ error: 'Invalid version.' }, { status: 400 })

  try {
    const created = await withDb(pool, true, async db => {
      const articleId = await lockArticle(db, params.categorySlug, params.slug)
      if (!articleId) return null
      return restoreVersion(db, articleId, n, access.session.email)
    })
    if (created === null) return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
    return NextResponse.json({ success: true, version: created, restoredFrom: n })
  } catch (err) {
    if (err instanceof VersionNotFoundError) {
      return NextResponse.json({ error: 'Version not found.' }, { status: 404 })
    }
    console.error('[version restore]', err)
    return NextResponse.json({ error: 'Restore failed. Nothing was changed.' }, { status: 500 })
  }
}

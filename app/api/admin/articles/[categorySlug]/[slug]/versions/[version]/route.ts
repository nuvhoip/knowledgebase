import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getVersion } from '@/lib/versions'
import { parseVersion, versionAccess } from '../access'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { categorySlug: string; slug: string; version: string }
}

/** GET /api/admin/articles/[categorySlug]/[slug]/versions/[version] — one full version (read-only). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const access = await versionAccess(params.categorySlug, params.slug)
  if ('error' in access) return access.error
  const n = parseVersion(params.version)
  if (!n) return NextResponse.json({ error: 'Invalid version.' }, { status: 400 })
  try {
    const version = await getVersion(pool, access.articleId, n)
    if (!version) return NextResponse.json({ error: 'Version not found.' }, { status: 404 })
    return NextResponse.json({ version })
  } catch (err) {
    console.error('[version GET]', err)
    return NextResponse.json({ error: 'Failed to load this version.' }, { status: 500 })
  }
}

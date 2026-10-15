import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { listVersions } from '@/lib/versions'
import { versionAccess } from './access'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

/** GET /api/admin/articles/[categorySlug]/[slug]/versions — version list, newest first. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const access = await versionAccess(params.categorySlug, params.slug)
  if ('error' in access) return access.error
  try {
    return NextResponse.json({ versions: await listVersions(pool, access.articleId) })
  } catch (err) {
    console.error('[versions GET]', err)
    return NextResponse.json({ error: 'Failed to load version history.' }, { status: 500 })
  }
}

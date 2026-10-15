import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getSession, type SessionPayload } from '@/lib/auth'
import { isVersioningEnabled } from '@/lib/flags'

// Shared gate for the version-history routes: 404 while KB_VERSIONING_ENABLED is off (the
// routes don't exist as far as anyone can tell), 403 for non-staff (Q4: all @nuvho.com
// staff), 404 for an unknown article.
export async function versionAccess(
  categorySlug: string,
  slug: string
): Promise<{ error: NextResponse } | { session: SessionPayload; articleId: number }> {
  if (!isVersioningEnabled()) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  }
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }
  const res = await pool.query(
    'SELECT id FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2',
    [categorySlug, slug]
  )
  if (res.rowCount === 0) {
    return { error: NextResponse.json({ error: 'Article not found.' }, { status: 404 }) }
  }
  return { session, articleId: res.rows[0].id }
}

/** A positive integer version number from the URL, or null. */
export function parseVersion(raw: string): number | null {
  return /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null
}

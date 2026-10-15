import { redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import Icon from '@/components/Icon'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'
import { STALE_AFTER_MONTHS, type ContentIndexRow } from '@/lib/contentIndex'
import ContentIndexTable from './ContentIndexTable'

export const dynamic = 'force-dynamic'

// Internal only: never indexed, never followed.
export const metadata = {
  title: 'Content index — Nuvho Knowledge Base',
  robots: { index: false, follow: false },
}

interface IndexQueryRow {
  id: number
  slug: string
  title: string
  description: string
  category_slug: string
  category_title: string
  subcategory_title: string
  status: 'pending' | 'published'
  source_tier: string | null
  submitted_by: string | null
  submitted_via: string | null
  vector_tier: string | null
  vector_synced_at: string | null
  created_at: string
  updated_at: string
}

// Read-only. Uses only columns that exist today; "last updated by" and "version" are not
// stored yet (see docs/handover/2026-10-kb-db-changes-for-glenn.md) and show "—".
async function getIndexRows(): Promise<ContentIndexRow[]> {
  const { rows } = await pool.query<IndexQueryRow>(
    `SELECT a.id, a.slug, a.title, a.description, a.category_slug,
            c.title AS category_title, s.title AS subcategory_title, a.status,
            a.source_tier, a.submitted_by, a.submitted_via, a.vector_tier,
            to_char(a.vector_synced_at, 'YYYY-MM-DD') AS vector_synced_at,
            to_char(a.created_at, 'YYYY-MM-DD')       AS created_at,
            to_char(a.updated_at, 'YYYY-MM-DD')       AS updated_at
     FROM nuvho_kb.articles a
     JOIN nuvho_kb.categories c ON c.slug = a.category_slug
     JOIN nuvho_kb.subcategories s ON s.slug = a.subcategory_slug
     ORDER BY a.updated_at ASC, a.title ASC`
  )
  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    categorySlug: r.category_slug,
    categoryTitle: r.category_title,
    subcategoryTitle: r.subcategory_title,
    status: r.status,
    sourceTier: r.source_tier,
    submittedBy: r.submitted_by,
    submittedVia: r.submitted_via,
    vectorTier: r.vector_tier,
    vectorSyncedAt: r.vector_synced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: null,
    version: null,
  }))
}

// Same staff gate as the admin dashboard (Q4: all @nuvho.com staff for now).
export default async function ContentIndexPage() {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    redirect('/login?next=/admin/content-index')
  }

  const rows = await getIndexRows()
  // The server's date, so the stale flags match between server render and hydration
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1 na-page">
        <div className="nw-wrap nw-wrap--app">
          <div className="na-head">
            <div>
              <Link href="/admin" className="nw-link">
                <Icon name="arrow-left" size={14} />
                Admin dashboard
              </Link>
              <h1 className="na-title" style={{ marginTop: 12 }}>Content index</h1>
              <p className="na-sub">
                Every Knowledge Base article, for review. Articles not updated in more than {STALE_AFTER_MONTHS} months are flagged <strong>Stale</strong>.
              </p>
            </div>
          </div>
          <ContentIndexTable rows={rows} today={today} />
        </div>
      </main>
      <Footer />
    </div>
  )
}

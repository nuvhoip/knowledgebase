// Internal content index (Jude, IT Catchup 13 Oct 2026): one row per KB article so outdated
// material is easy to find and review. Pure logic only — the query lives in
// app/admin/content-index/page.tsx — so it can be unit-tested without a database.

/** An article is flagged stale when it has not been updated for longer than this (Q6). */
export const STALE_AFTER_MONTHS = 6

/** Rows per page in the index table. */
export const PAGE_SIZE = 50

export interface ContentIndexRow {
  id: number
  slug: string
  title: string
  description: string
  categorySlug: string
  categoryTitle: string
  subcategoryTitle: string
  status: 'pending' | 'published'
  /** Tier the article was imported from (written by the vector-DB import pipeline). */
  sourceTier: string | null
  submittedBy: string | null
  submittedVia: string | null
  /** Tier the article was last synced to from the admin dashboard. */
  vectorTier: string | null
  /** YYYY-MM-DD */
  vectorSyncedAt: string | null
  /** YYYY-MM-DD */
  createdAt: string
  /** YYYY-MM-DD (the column is a DATE) */
  updatedAt: string
  /** Not stored yet — see docs/handover (Glenn). */
  updatedBy: string | null
  /** Not stored yet — arrives with versioning (Pass 4). */
  version: number | null
}

export type SortKey = 'title' | 'category' | 'status' | 'sourceTier' | 'vectorTier' | 'createdAt' | 'updatedAt'
export type SortDir = 'asc' | 'desc'

export interface IndexFilters {
  query: string
  category: string // '' = all
  status: '' | 'pending' | 'published'
  /** '' = all, 'none' = no source recorded, otherwise a tier */
  sourceTier: string
  /** '' = all, 'none' = never synced, otherwise a tier */
  vectorTier: string
  staleOnly: boolean
}

export const EMPTY_FILTERS: IndexFilters = {
  query: '', category: '', status: '', sourceTier: '', vectorTier: '', staleOnly: false,
}

/** True when `updatedAt` (YYYY-MM-DD) is more than `months` calendar months before `today`. */
export function isStale(updatedAt: string, today: Date, months = STALE_AFTER_MONTHS): boolean {
  const [y, m, d] = updatedAt.split('-').map(Number)
  if (!y || !m || !d) return false
  // Cutoff = today minus `months`, clamped to the month's last day (31 Aug − 6 months → 28/29 Feb)
  const ty = today.getFullYear()
  const tm = today.getMonth() - months
  const lastDay = new Date(ty, tm + 1, 0).getDate()
  const cutoff = new Date(ty, tm, Math.min(today.getDate(), lastDay))
  return new Date(y, m - 1, d) < cutoff
}

function matchesTier(value: string | null, filter: string): boolean {
  if (!filter) return true
  if (filter === 'none') return !value
  return value === filter
}

export function filterRows(rows: ContentIndexRow[], f: IndexFilters, today: Date): ContentIndexRow[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(r =>
    (!f.category || r.categorySlug === f.category) &&
    (!f.status || r.status === f.status) &&
    matchesTier(r.sourceTier, f.sourceTier) &&
    matchesTier(r.vectorTier, f.vectorTier) &&
    (!f.staleOnly || isStale(r.updatedAt, today)) &&
    (!q || [r.title, r.slug, r.description, r.categoryTitle, r.subcategoryTitle, r.submittedBy ?? '']
      .some(v => v.toLowerCase().includes(q)))
  )
}

function sortValue(r: ContentIndexRow, key: SortKey): string {
  switch (key) {
    case 'category': return `${r.categoryTitle}\u0000${r.subcategoryTitle}`.toLowerCase()
    case 'title': return r.title.toLowerCase()
    default: return (r[key] ?? '').toString().toLowerCase()
  }
}

/** Stable sort; empty values always go last, whichever the direction. Ties fall back to title. */
export function sortRows(rows: ContentIndexRow[], key: SortKey, dir: SortDir): ContentIndexRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i, v: sortValue(row, key) }))
    .sort((a, b) => {
      if (!a.v !== !b.v) return a.v ? -1 : 1
      const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0
      if (c) return c * sign
      const t = a.row.title.localeCompare(b.row.title)
      return t || a.i - b.i
    })
    .map(x => x.row)
}

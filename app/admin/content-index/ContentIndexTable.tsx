'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/Icon'
import { TIERS } from '@/components/admin/SyncModal'
import {
  ContentIndexRow, EMPTY_FILTERS, IndexFilters, PAGE_SIZE, SortDir, SortKey,
  filterRows, isStale, sortRows,
} from '@/lib/contentIndex'

// Table, badge and field styles follow the admin dashboard (browser-app law §5/§6/§8).

const COLUMNS: { key: SortKey | null; label: string; center?: boolean }[] = [
  { key: 'title', label: 'Article' },
  { key: 'category', label: 'Category / sub-category' },
  { key: 'status', label: 'Status', center: true },
  { key: 'sourceTier', label: 'Imported from' },
  { key: 'vectorTier', label: 'Synced to' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Last updated' },
  { key: null, label: 'Updated by' },
  { key: null, label: 'Version', center: true },
]

function formatDate(ymd: string | null): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="na-table__sub">—</span>
  const t = TIERS.find(x => x.value === tier)
  return <span className={`na-badge ${t?.badge ?? 'na-badge--neutral'}`}>{t?.label ?? tier}</span>
}

function tierOptions(values: (string | null)[]) {
  const seen = Array.from(new Set(values.filter((v): v is string => !!v))).sort()
  return seen.map(v => ({ value: v, label: TIERS.find(t => t.value === v)?.label ?? v }))
}

export default function ContentIndexTable({ rows, today }: { rows: ContentIndexRow[]; today: string }) {
  const [filters, setFilters] = useState<IndexFilters>(EMPTY_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('asc') // oldest first: what needs review
  const [page, setPage] = useState(1)

  const todayDate = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [today])

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach(r => map.set(r.categorySlug, r.categoryTitle))
    return Array.from(map, ([slug, title]) => ({ slug, title })).sort((a, b) => a.title.localeCompare(b.title))
  }, [rows])
  const sourceOptions = useMemo(() => tierOptions(rows.map(r => r.sourceTier)), [rows])
  const syncOptions = useMemo(() => tierOptions(rows.map(r => r.vectorTier)), [rows])
  const staleCount = useMemo(() => rows.filter(r => isStale(r.updatedAt, todayDate)).length, [rows, todayDate])

  const visible = useMemo(
    () => sortRows(filterRows(rows, filters, todayDate), sortKey, sortDir),
    [rows, filters, todayDate, sortKey, sortDir]
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  function set<K extends keyof IndexFilters>(key: K, value: IndexFilters[K]) {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  return (
    <div>
      <div className="na-toolbar">
        <div className="na-toolbar__left">
          <input
            type="search"
            value={filters.query}
            onChange={e => set('query', e.target.value)}
            className="na-input na-index__search"
            placeholder="Search title, slug, description…"
            aria-label="Search articles"
          />
          <select value={filters.category} onChange={e => set('category', e.target.value)} className="na-select" aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
          <select value={filters.status} onChange={e => set('status', e.target.value as IndexFilters['status'])} className="na-select" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="published">Live</option>
            <option value="pending">Pending</option>
          </select>
          <select value={filters.sourceTier} onChange={e => set('sourceTier', e.target.value)} className="na-select" aria-label="Filter by imported-from tier">
            <option value="">Imported from: any</option>
            {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="none">Not imported</option>
          </select>
          <select value={filters.vectorTier} onChange={e => set('vectorTier', e.target.value)} className="na-select" aria-label="Filter by synced-to tier">
            <option value="">Synced to: any</option>
            {syncOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="none">Never synced</option>
          </select>
          <label className="na-index__check">
            <input type="checkbox" checked={filters.staleOnly} onChange={e => set('staleOnly', e.target.checked)} />
            Stale only ({staleCount})
          </label>
          {filtered && (
            <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}>
              Clear filters
            </button>
          )}
        </div>
        <span className="na-index__total" aria-live="polite">{visible.length} of {rows.length} articles</span>
      </div>

      <div className="na-card na-card--table">
        <div className="na-index__scroll">
          <table className="na-table">
            <thead>
              <tr>
                {COLUMNS.map(col => {
                  const active = col.key !== null && col.key === sortKey
                  return (
                    <th
                      key={col.label}
                      className={col.center ? 'na-table__c' : undefined}
                      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {col.key ? (
                        <button type="button" className="na-index__sort" onClick={() => sortBy(col.key!)}>
                          {col.label}
                          <Icon
                            name="angle-down"
                            size={10}
                            className={`na-index__arrow${active ? ' na-index__arrow--on' : ''}${active && sortDir === 'asc' ? ' na-index__arrow--up' : ''}`}
                          />
                        </button>
                      ) : col.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => {
                const stale = isStale(r.updatedAt, todayDate)
                return (
                  <tr key={r.id} className={`na-row${stale ? ' na-row--stale' : ''}`}>
                    <td>
                      {r.status === 'published' ? (
                        <Link href={`/articles/${r.categorySlug}/${r.slug}`} className="na-table__title">{r.title}</Link>
                      ) : (
                        <span className="na-table__title" style={{ cursor: 'default' }}>{r.title}</span>
                      )}
                      <p className="na-table__slug">{r.categorySlug}/{r.slug}</p>
                    </td>
                    <td>
                      <span className="na-table__sub">{r.categoryTitle}</span>
                      <span className="na-table__sub">{r.subcategoryTitle}</span>
                    </td>
                    <td className="na-table__c">
                      <span className={`na-badge ${r.status === 'published' ? 'na-badge--good' : 'na-badge--warn'}`}>
                        {r.status === 'published' ? 'Live' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      <TierBadge tier={r.sourceTier} />
                      {(r.submittedVia || r.submittedBy) && (
                        <span className="na-table__sub">{[r.submittedVia, r.submittedBy].filter(Boolean).join(' · ')}</span>
                      )}
                    </td>
                    <td>
                      <TierBadge tier={r.vectorTier} />
                      {r.vectorSyncedAt && <span className="na-table__sub na-index__date">{formatDate(r.vectorSyncedAt)}</span>}
                    </td>
                    <td><span className="na-table__sub na-index__date">{formatDate(r.createdAt)}</span></td>
                    <td>
                      <span className="na-table__sub na-index__date">{formatDate(r.updatedAt)}</span>
                      {stale && <span className="na-badge na-badge--warn na-index__stale">Stale</span>}
                    </td>
                    <td><span className="na-table__sub">{r.updatedBy ?? '—'}</span></td>
                    <td className="na-table__c"><span className="na-table__sub">{r.version ?? '—'}</span></td>
                  </tr>
                )
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="na-table__c">
                    <span className="na-table__sub">No articles match these filters.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <nav className="na-index__pager" aria-label="Pagination">
          <button type="button" className="nv-btn nv-btn--secondary nv-btn--sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
            <Icon name="angle-left" size={12} />
            Previous
          </button>
          <span>Page {current} of {pageCount}</span>
          <button type="button" className="nv-btn nv-btn--secondary nv-btn--sm" disabled={current === pageCount} onClick={() => setPage(current + 1)}>
            Next
            <Icon name="angle-right" size={12} />
          </button>
        </nav>
      )}
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import { ContentIndexRow, EMPTY_FILTERS, filterRows, isStale, sortRows } from './contentIndex'

const row = (over: Partial<ContentIndexRow>): ContentIndexRow => ({
  id: 1, slug: 'a', title: 'A', description: '', categorySlug: 'support', categoryTitle: 'Support',
  subcategoryTitle: 'General', status: 'published', sourceTier: null, submittedBy: null, submittedVia: null,
  vectorTier: null, vectorSyncedAt: null, createdAt: '2026-01-01', updatedAt: '2026-10-01',
  updatedBy: null, version: null, ...over,
})

const today = new Date(2026, 9, 15) // 15 Oct 2026

describe('isStale', () => {
  it('flags articles not updated for more than 6 months', () => {
    expect(isStale('2026-04-14', today)).toBe(true)
    expect(isStale('2026-04-15', today)).toBe(false) // exactly 6 months — not yet stale
    expect(isStale('2026-10-15', today)).toBe(false)
  })
  it('clamps month ends (31 Aug − 6 months = 28 Feb)', () => {
    const aug31 = new Date(2026, 7, 31)
    expect(isStale('2026-02-27', aug31)).toBe(true)
    expect(isStale('2026-02-28', aug31)).toBe(false)
  })
  it('crosses year boundaries and takes a custom window', () => {
    expect(isStale('2025-12-31', new Date(2026, 0, 31), 1)).toBe(false)
    expect(isStale('2025-12-30', new Date(2026, 0, 31), 1)).toBe(true)
  })
  it('never flags an unparseable date', () => {
    expect(isStale('', today)).toBe(false)
  })
})

describe('filterRows', () => {
  const rows = [
    row({ id: 1, title: 'Booking engine setup', status: 'published', sourceTier: 'internal', vectorTier: 'domain', updatedAt: '2025-01-01' }),
    row({ id: 2, title: 'Rates FAQ', status: 'pending', categorySlug: 'rates', submittedBy: 'glenn@nuvho.com' }),
    row({ id: 3, title: 'Contacting support', description: 'Live chat and email' }),
  ]
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => filterRows(rows, { ...EMPTY_FILTERS, ...f }, today).map(r => r.id)

  it('returns everything with no filters', () => expect(ids({})).toEqual([1, 2, 3]))
  it('searches title, description and submitter, case-insensitively', () => {
    expect(ids({ query: 'BOOKING' })).toEqual([1])
    expect(ids({ query: 'live chat' })).toEqual([3])
    expect(ids({ query: 'glenn' })).toEqual([2])
  })
  it('filters by category and status', () => {
    expect(ids({ category: 'rates' })).toEqual([2])
    expect(ids({ status: 'published' })).toEqual([1, 3])
  })
  it('filters by tier, including "none"', () => {
    expect(ids({ sourceTier: 'internal' })).toEqual([1])
    expect(ids({ sourceTier: 'none' })).toEqual([2, 3])
    expect(ids({ vectorTier: 'none' })).toEqual([2, 3])
  })
  it('shows stale rows only', () => expect(ids({ staleOnly: true })).toEqual([1]))
})

describe('sortRows', () => {
  const rows = [
    row({ id: 1, title: 'beta', updatedAt: '2026-03-01', vectorTier: 'internal' }),
    row({ id: 2, title: 'Alpha', updatedAt: '2026-09-01', vectorTier: null }),
    row({ id: 3, title: 'gamma', updatedAt: '2026-01-01', vectorTier: 'domain' }),
  ]
  const ids = (k: Parameters<typeof sortRows>[1], d: 'asc' | 'desc') => sortRows(rows, k, d).map(r => r.id)

  it('sorts titles case-insensitively', () => expect(ids('title', 'asc')).toEqual([2, 1, 3]))
  it('sorts dates both ways', () => {
    expect(ids('updatedAt', 'asc')).toEqual([3, 1, 2])
    expect(ids('updatedAt', 'desc')).toEqual([2, 1, 3])
  })
  it('keeps empty values last in either direction', () => {
    expect(ids('vectorTier', 'asc')).toEqual([3, 1, 2])
    expect(ids('vectorTier', 'desc')).toEqual([1, 3, 2])
  })
  it('does not mutate the input', () => {
    sortRows(rows, 'title', 'desc')
    expect(rows.map(r => r.id)).toEqual([1, 2, 3])
  })
})

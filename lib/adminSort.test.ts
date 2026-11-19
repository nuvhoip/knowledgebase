import { describe, expect, it } from 'vitest'
import { nextSort, sortRows } from './adminSort'

interface Row { title: string; count: number | null; live: boolean }

const rows: Row[] = [
  { title: 'beta', count: 2, live: true },
  { title: 'Alpha 10', count: null, live: false },
  { title: 'alpha 2', count: 5, live: true },
  { title: 'Gamma', count: 2, live: false },
]

const value = (r: Row, key: 'title' | 'count' | 'live') => r[key]

describe('nextSort', () => {
  it('cycles asc → desc → default for the same column', () => {
    const asc = nextSort(null, 'title')
    expect(asc).toEqual({ key: 'title', dir: 'asc' })
    const desc = nextSort(asc, 'title')
    expect(desc).toEqual({ key: 'title', dir: 'desc' })
    expect(nextSort(desc, 'title')).toBeNull()
  })

  it('starts a different column ascending', () => {
    expect(nextSort({ key: 'title', dir: 'desc' }, 'count')).toEqual({ key: 'count', dir: 'asc' })
  })
})

describe('sortRows', () => {
  it('returns the original order for a null sort, without mutating', () => {
    const out = sortRows(rows, null, value)
    expect(out).toEqual(rows)
    expect(out).not.toBe(rows)
  })

  it('sorts text case-insensitively with natural numbers', () => {
    expect(sortRows(rows, { key: 'title', dir: 'asc' }, value).map(r => r.title))
      .toEqual(['alpha 2', 'Alpha 10', 'beta', 'Gamma'])
    expect(sortRows(rows, { key: 'title', dir: 'desc' }, value).map(r => r.title))
      .toEqual(['Gamma', 'beta', 'Alpha 10', 'alpha 2'])
  })

  it('sorts numbers numerically, keeps ties stable and blanks last in both directions', () => {
    expect(sortRows(rows, { key: 'count', dir: 'asc' }, value).map(r => r.title))
      .toEqual(['beta', 'Gamma', 'alpha 2', 'Alpha 10'])
    expect(sortRows(rows, { key: 'count', dir: 'desc' }, value).map(r => r.title))
      .toEqual(['alpha 2', 'beta', 'Gamma', 'Alpha 10'])
  })

  it('sorts booleans false before true ascending', () => {
    expect(sortRows(rows, { key: 'live', dir: 'asc' }, value).map(r => r.live))
      .toEqual([false, false, true, true])
  })
})

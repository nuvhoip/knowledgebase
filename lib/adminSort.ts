// Column sorting for the admin dashboard tables (components/admin/SortableTh.tsx).
// Kept free of React so it can be unit-tested.

export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

export type SortValue = string | number | boolean | null | undefined

/**
 * Next state when a column header is clicked: a new column starts ascending,
 * then descending, then back to the table's default order (null).
 */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function isBlank(v: SortValue): boolean {
  return v === null || v === undefined || v === ''
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(String(a), String(b))
}

/**
 * Rows sorted by `value(row, key)`. Blank values always sort last, whatever the
 * direction; ties keep their original order. A null sort returns the rows unchanged.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  value: (row: T, key: K) => SortValue
): T[] {
  if (!sort) return rows.slice()
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      const aBlank = isBlank(a.v)
      const bBlank = isBlank(b.v)
      if (aBlank !== bBlank) return aBlank ? 1 : -1
      const c = aBlank ? 0 : compareValues(a.v, b.v)
      return c ? c * sign : a.i - b.i
    })
    .map(x => x.row)
}

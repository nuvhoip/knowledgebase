'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'
import { nextSort, type SortState } from '@/lib/adminSort'

/** Sort state for one table: click a header for ASC, again for DESC, a third time for the default order. */
export function useSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = useState<SortState<K> | null>(initial)
  const toggle = (key: K) => setSort(current => nextSort(current, key))
  return [sort, toggle] as const
}

// Clickable column header — same arrow as the Content index table (.na-index__sort).
export default function SortableTh<K extends string>({ label, sortKey, sort, onSort, className }: {
  label: string
  sortKey: K
  sort: SortState<K> | null
  onSort: (key: K) => void
  className?: string
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const next = !active ? 'ascending' : dir === 'asc' ? 'descending' : 'default order'
  return (
    <th className={className} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}>
      <button type="button" className="na-index__sort" onClick={() => onSort(sortKey)} title={`Sort by ${label.toLowerCase()} (${next})`}>
        {label}
        <Icon
          name="angle-down"
          size={10}
          className={`na-index__arrow${active ? ' na-index__arrow--on' : ''}${dir === 'asc' ? ' na-index__arrow--up' : ''}`}
        />
      </button>
    </th>
  )
}

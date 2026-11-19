'use client'

import { FormEvent, KeyboardEvent, useEffect, useId, useState } from 'react'
import Icon from '@/components/Icon'
import type { AdminSearchSuggestion } from '@/lib/types'

interface Props {
  /** A suggestion was picked: open that article in the Articles tab's editor. */
  onOpen: (s: AdminSearchSuggestion) => void
  /** Enter with nothing highlighted, or "Show all results": filter the Articles table to the term. */
  onShowAll: (term: string) => Promise<void> | void
}

const SUGGEST_MIN_CHARS = 2
const SUGGEST_DEBOUNCE_MS = 200

// Admin dashboard article search. Same behaviour as the public SearchForm (fuzzy
// search-as-you-type, ↑/↓/Enter/Esc, same dropdown styles) but on the light admin
// field, over EVERY article (pending too) via /api/admin/search.
export default function AdminArticleSearch({ onOpen, onShowAll }: Props) {
  const listId = useId()
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<AdminSearchSuggestion[]>([])
  const [suggestedFor, setSuggestedFor] = useState('')
  const [fetching, setFetching] = useState(false)
  const [showingAll, setShowingAll] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const term = q.trim()
    if (term.length < SUGGEST_MIN_CHARS) {
      setSuggestions([])
      setSuggestedFor('')
      setFetching(false)
      return
    }
    const controller = new AbortController()
    setFetching(true)
    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
          setSuggestedFor(term)
          setActive(-1)
          setFetching(false)
        })
        .catch(err => {
          if ((err as Error).name !== 'AbortError') {
            setSuggestions([])
            setFetching(false)
          }
        })
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  function pick(s: AdminSearchSuggestion) {
    setOpen(false)
    setActive(-1)
    onOpen(s)
  }

  async function showAll() {
    const term = q.trim()
    if (!term) return
    setOpen(false)
    setActive(-1)
    setShowingAll(true)
    try {
      await onShowAll(term)
    } finally {
      setShowingAll(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (open && active >= 0 && suggestions[active]) pick(suggestions[active])
    else showAll()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1))
    }
  }

  const term = q.trim()
  const showList = open && term.length >= SUGGEST_MIN_CHARS && (suggestions.length > 0 || (!fetching && suggestedFor === term))
  const busy = fetching || showingAll

  return (
    <form className="na-search" role="search" onSubmit={onSubmit}>
      <Icon name="magnifying-glass" size={16} className="na-search__icon" />
      <input
        type="search"
        className="na-input na-search__input"
        value={q}
        onChange={e => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search articles…"
        aria-label="Search articles"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {busy && (
        <span className="na-search__spinner" role="status" aria-label={showingAll ? 'Searching' : 'Finding suggestions'}>
          <span className="nv-spin nv-spin--sm" />
        </span>
      )}

      {showList && (
        // mousedown keeps focus in the input so the click lands before onBlur closes the list
        <ul className="nw-suggest na-search__list" id={listId} role="listbox" aria-label="Matching articles" onMouseDown={e => e.preventDefault()}>
          {suggestions.length === 0 ? (
            <li className="nw-suggest__empty">No close matches. Press Enter to filter the Articles table anyway.</li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={`${s.categorySlug}/${s.slug}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`nw-suggest__item${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <span className="nw-suggest__title">{s.title}</span>
                <span className="nw-suggest__meta">
                  {s.categoryTitle} › {s.subcategoryTitle}
                  {s.status === 'pending' && <span className="na-badge na-badge--warn na-badge--xs">Pending</span>}
                  {s.isPrivate && <><Icon name="lock" size={10} alt="Private" /> Private</>}
                </span>
              </li>
            ))
          )}
          <li className="nw-suggest__all" role="option" aria-selected={false} onClick={showAll}>
            Show all results for “{term}” in Articles
            <Icon name="arrow-right" size={14} />
          </li>
        </ul>
      )}
    </form>
  )
}

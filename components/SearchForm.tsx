'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'

interface Props {
  initial?: string
  autoFocus?: boolean
  popular?: string[]
}

// On-dark search: input (Figma 794:104) + onDark button (794:106), used inside heroes.
export default function SearchForm({ initial = '', autoFocus = false, popular = [] }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initial)

  function go(term: string) {
    const t = term.trim()
    if (t) router.push(`/search?q=${encodeURIComponent(t)}`)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    go(q)
  }

  return (
    <>
      <form className="nw-search" role="search" onSubmit={onSubmit}>
        <div className="nw-search__field">
          <Icon name="magnifying-glass" size={18} />
          <input
            type="search"
            className="nw-search__input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search articles, guides and FAQs…"
            aria-label="Search the Knowledge Base"
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </div>
        <button type="submit" className="nv-btn nv-btn--ondark nw-search__btn">Search</button>
      </form>

      {popular.length > 0 && (
        <div className="nw-hero__popular">
          <span>Popular:</span>
          {popular.map(term => (
            <button key={term} type="button" onClick={() => go(term)}>{term}</button>
          ))}
        </div>
      )}
    </>
  )
}

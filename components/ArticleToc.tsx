'use client'

import { useEffect, useMemo, useState, MouseEvent } from 'react'
import type { TocEntry } from '@/lib/toc'

interface Props {
  entries: TocEntry[]
  /** `side`: sticky "On this page" panel (≥1024px). `inline`: "Contents" block above the body (<1024px). */
  variant: 'side' | 'inline'
}

// The outline is always fully expanded (decision 17 Nov 2026): every H2 and its H3s are
// visible at once, in both variants. No accordions, no toggles, nothing to open first.

// A heading counts as the current section once its top passes this line (px from the
// viewport top). The header is not sticky, so this only needs to clear the reading line.
const ACTIVE_LINE = 120

function flatten(entries: TocEntry[], out: string[] = []) {
  for (const e of entries) {
    out.push(e.id)
    flatten(e.children, out)
  }
  return out
}

/** Id of the last heading whose top has scrolled past ACTIVE_LINE (the first heading before that). */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '')
  const key = ids.join('|')

  useEffect(() => {
    const els = key.split('|').map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    const update = () => {
      let current = els[0].id
      for (const el of els) {
        if (el.getBoundingClientRect().top - ACTIVE_LINE <= 1) current = el.id
        else break
      }
      setActive(current)
    }
    // The observer fires whenever a heading crosses ACTIVE_LINE in either direction;
    // positions are then read directly so fast scrolls and deep links resolve correctly.
    const io = new IntersectionObserver(update, { rootMargin: `-${ACTIVE_LINE}px 0px 0px 0px`, threshold: [0, 1] })
    els.forEach(el => io.observe(el))
    update()
    return () => io.disconnect()
  }, [key])

  return [active, setActive] as const
}

export default function ArticleToc({ entries, variant }: Props) {
  const ids = useMemo(() => flatten(entries), [entries])
  const [active, setActive] = useActiveHeading(ids)

  function go(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id)
    if (!target) return
    e.preventDefault()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    history.pushState(null, '', `#${encodeURIComponent(id)}`)
    // Headings carry tabindex="-1" (lib/toc.ts), so keyboard focus follows the jump
    target.focus({ preventScroll: true })
    setActive(id)
  }

  function renderList(list: TocEntry[], sub = false) {
    return (
      <ul className={`nw-toc__list${sub ? ' nw-toc__list--sub' : ''}`}>
        {list.map(e => {
          const isActive = active === e.id
          return (
            <li key={e.id}>
              <a
                href={`#${encodeURIComponent(e.id)}`}
                className={`nw-toc__link${isActive ? ' nw-toc__link--active' : ''}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={ev => go(ev, e.id)}
              >
                {e.text}
              </a>
              {e.children.length > 0 && renderList(e.children, true)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <nav aria-label="On this page" className={`nw-toc nw-toc--${variant}`}>
      <p className="nw-toc__title">{variant === 'side' ? 'On this page' : 'Contents'}</p>
      {renderList(entries)}
    </nav>
  )
}

'use client'

import { useEffect, useMemo, useState, MouseEvent } from 'react'
import Icon from './Icon'
import type { TocEntry } from '@/lib/toc'

interface Props {
  entries: TocEntry[]
  /** `side`: sticky "On this page" panel (≥1024px). `inline`: collapsible "Contents" block above the body. */
  variant: 'side' | 'inline'
}

// A heading counts as the current section once its top passes this line (px from the
// viewport top). The header is not sticky, so this only needs to clear the reading line.
const ACTIVE_LINE = 120

function flatten(entries: TocEntry[], parents: string[] = [], out: { id: string; parents: string[] }[] = []) {
  for (const e of entries) {
    out.push({ id: e.id, parents })
    flatten(e.children, [...parents, e.id], out)
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
  const flat = useMemo(() => flatten(entries), [entries])
  const [active, setActive] = useActiveHeading(flat.map(f => f.id))
  // Explicit open/closed choices; anything not chosen follows the active section.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [inlineOpen, setInlineOpen] = useState(false)

  const activePath = useMemo(() => {
    const hit = flat.find(f => f.id === active)
    return new Set(hit ? [...hit.parents, hit.id] : [])
  }, [flat, active])

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
          const hasChildren = e.children.length > 0
          const open = toggled[e.id] ?? activePath.has(e.id)
          const subId = `toc-${variant}-${e.id}`
          const isActive = active === e.id
          return (
            <li key={e.id}>
              <div className="nw-toc__row">
                <a
                  href={`#${encodeURIComponent(e.id)}`}
                  className={`nw-toc__link${isActive ? ' nw-toc__link--active' : ''}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={ev => go(ev, e.id)}
                >
                  {e.text}
                </a>
                {hasChildren && (
                  <button
                    type="button"
                    className="nw-toc__toggle"
                    aria-expanded={open}
                    aria-controls={subId}
                    aria-label={`Subsections of ${e.text}`}
                    onClick={() => setToggled(t => ({ ...t, [e.id]: !open }))}
                  >
                    <Icon name="angle-down" size={10} />
                  </button>
                )}
              </div>
              {hasChildren && (
                <div id={subId} hidden={!open}>
                  {renderList(e.children, true)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  if (variant === 'side') {
    return (
      <nav aria-label="On this page" className="nw-toc nw-toc--side">
        <p className="nw-toc__title">On this page</p>
        {renderList(entries)}
      </nav>
    )
  }

  return (
    <nav aria-label="On this page" className="nw-toc nw-toc--inline">
      <button
        type="button"
        className="nw-toc__head"
        aria-expanded={inlineOpen}
        aria-controls="toc-inline-list"
        onClick={() => setInlineOpen(o => !o)}
      >
        Contents
        <Icon name="angle-down" size={12} />
      </button>
      <div id="toc-inline-list" hidden={!inlineOpen}>
        {renderList(entries)}
      </div>
    </nav>
  )
}

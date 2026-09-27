'use client'

import { useState } from 'react'
import ArticleTile, { TileCategory } from './ArticleTile'
import { Article } from '@/lib/types'

export interface FilterGroup {
  slug: string
  title: string
  articles: Article[]
}

interface Props {
  groups: FilterGroup[]
  category: TileCategory
}

// Segmented chip bar + "Showing n of m" + tile grid (Figma 1188:2 tab state).
export default function SubcategoryFilter({ groups, category }: Props) {
  const [active, setActive] = useState('all')

  const total = groups.reduce((n, g) => n + g.articles.length, 0)
  const visible = active === 'all' ? groups : groups.filter(g => g.slug === active)
  const count = visible.reduce((n, g) => n + g.articles.length, 0)
  const activeTitle = groups.find(g => g.slug === active)?.title

  return (
    <>
      {groups.length > 1 && (
        <div className="nw-chips" role="tablist" aria-label="Filter by sub-category">
          <button
            type="button"
            role="tab"
            aria-selected={active === 'all'}
            className={`nw-chip${active === 'all' ? ' nw-chip--active' : ''}`}
            onClick={() => setActive('all')}
          >
            All
          </button>
          {groups.map(g => (
            <button
              key={g.slug}
              type="button"
              role="tab"
              aria-selected={active === g.slug}
              className={`nw-chip${active === g.slug ? ' nw-chip--active' : ''}`}
              onClick={() => setActive(g.slug)}
            >
              {g.title}
            </button>
          ))}
        </div>
      )}

      <p className="nw-count">
        Showing {count} of {total} {total === 1 ? 'article' : 'articles'}
        {activeTitle && <>&nbsp;&nbsp;·&nbsp;&nbsp;{activeTitle}</>}
      </p>

      {visible.map(g => (
        <section key={g.slug} className="nw-group" aria-label={g.title}>
          {active === 'all' && groups.length > 1 && <h2 className="nw-h3">{g.title}</h2>}
          <div className="nw-tiles">
            {g.articles.map(a => (
              <ArticleTile key={a.slug} article={a} category={category} showCategory={false} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

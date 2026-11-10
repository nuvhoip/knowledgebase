import Link from 'next/link'
import type { Tag } from '@/lib/types'

interface Props {
  tags: Tag[]
  label?: string
}

// Tag chips under the article lede. rel="tag" tells crawlers the link is a topic label for
// this page; each chip links to /tags/[slug].
export default function TagList({ tags, label = 'Tags' }: Props) {
  if (tags.length === 0) return null
  return (
    <nav className="nw-article__tags" aria-label={label}>
      <span className="nw-article__tags-label">{label}</span>
      <ul>
        {tags.map(t => (
          <li key={t.slug}>
            <Link href={`/tags/${t.slug}`} rel="tag" className="nw-tag nw-tag--link">{t.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

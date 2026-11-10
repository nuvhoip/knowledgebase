import Link from 'next/link'
import Icon from './Icon'
import type { Article } from '@/lib/types'

// "Related articles" at the foot of an article: published articles sharing the most tags.
// Internal links between related pages help readers, search engines and AI crawlers alike.
export default function RelatedArticles({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null
  return (
    <section className="nw-related" aria-labelledby="related-heading">
      <h2 id="related-heading" className="nw-related__h">Related articles</h2>
      <ul>
        {articles.map(a => (
          <li key={`${a.categorySlug}/${a.slug}`}>
            <Link href={`/articles/${a.categorySlug}/${a.slug}`} className="nw-related__link">
              <span className="nw-related__title">{a.title}</span>
              <span className="nw-related__desc">{a.description}</span>
            </Link>
            {a.effectiveVisibility === 'private' && (
              <span className="nw-related__lock"><Icon name="lock" size={11} alt="Sign-in required" /></span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

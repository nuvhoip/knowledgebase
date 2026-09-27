import Link from 'next/link'
import Icon from './Icon'
import { extractHero } from './heroImage'
import { Article } from '@/lib/types'
import type { TileCategory } from './ArticleTile'

interface Props {
  article: Article
  category?: TileCategory
}

// Featured article (Figma 793:2329): image 640×440 r24 + copy column. Uses the article's
// hero image when present; otherwise a Blend-gradient panel carrying the category icon.
export default function FeaturedArticle({ article, category }: Props) {
  const href = `/articles/${article.categorySlug}/${article.slug}`
  const catTitle = category?.title ?? article.categorySlug.replace(/-/g, ' ')
  const { hero } = extractHero(article.content)

  return (
    <div className="nw-feature">
      <div className="nw-feature__slot">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="nw-feature__img" src={hero.src} alt={hero.alt} />
        ) : (
          <>
            <span className="nv-sheet nv-sheet--focal" aria-hidden="true" />
            <span className="nv-sheet nv-sheet--1" aria-hidden="true" />
            <Icon name={category?.icon ?? 'file-lines'} size={120} />
            <span>{catTitle}</span>
          </>
        )}
      </div>

      <div className="nw-feature__copy">
        <span className="nw-eyebrow">Featured article</span>
        <div className="nw-tile__tags">
          <span className="nw-tag nw-tag--lg">{catTitle}</span>
          {article.effectiveVisibility === 'private' && (
            <span className="nw-tag nw-tag--lg"><Icon name="lock" size={11} alt="Sign-in required" />Members</span>
          )}
        </div>
        <h3 className="nw-feature__title">{article.title}</h3>
        <p className="nw-feature__desc">{article.description}</p>
        <span className="nw-feature__meta">
          Nuvho&nbsp;&nbsp;·&nbsp;&nbsp;{article.updatedAt}&nbsp;&nbsp;·&nbsp;&nbsp;{article.readTime} min read
        </span>
        <Link href={href} className="nv-btn nv-btn--secondary nv-btn--lg">Read the article</Link>
      </div>
    </div>
  )
}

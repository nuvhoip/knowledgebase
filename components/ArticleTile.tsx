import Link from 'next/link'
import Icon from './Icon'
import { extractHero } from './heroImage'
import { Article } from '@/lib/types'

export interface TileCategory {
  title: string
  icon: string
}

interface Props {
  article: Article
  category?: TileCategory
  showCategory?: boolean
}

function humanise(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Article tile (Figma 1188:49). The 190px image slot shows the article's hero image
// when it carries one (components/heroImage.ts), otherwise the category's duotone icon.
export default function ArticleTile({ article, category, showCategory = true }: Props) {
  const title = category?.title ?? humanise(article.categorySlug)
  const icon = category?.icon ?? 'file-lines'
  const { hero } = extractHero(article.content)

  return (
    <Link href={`/articles/${article.categorySlug}/${article.slug}`} className="nw-tile">
      <div className="nw-tile__slot">
        {hero
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="nw-tile__img" src={hero.src} alt="" />
          : <Icon name={icon} size={56} />}
      </div>
      <div className="nw-tile__body">
        <div className="nw-tile__tags">
          {showCategory && <span className="nw-tag">{title}</span>}
          {article.effectiveVisibility === 'private' && (
            <span className="nw-tag"><Icon name="lock" size={10} alt="Sign-in required" />Members</span>
          )}
        </div>
        <h3 className="nw-tile__title">{article.title}</h3>
        <p className="nw-tile__desc">{article.description}</p>
        <span className="nw-tile__meta">
          Nuvho&nbsp;&nbsp;·&nbsp;&nbsp;{article.updatedAt}&nbsp;&nbsp;·&nbsp;&nbsp;{article.readTime} min read
        </span>
      </div>
    </Link>
  )
}

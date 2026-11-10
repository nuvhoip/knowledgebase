import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import Icon from '@/components/Icon'
import ArticleTile from '@/components/ArticleTile'
import JsonLd from '@/components/JsonLd'
import { getArticlesByTag, getCategories, getTagBySlug, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'
import { isTagsEnabled } from '@/lib/flags'
import { SITE_NAME, absoluteUrl, articlePath, collectionJsonLd } from '@/lib/seo'

// Force dynamic rendering — no DB access during `next build` (see the article page).
export const dynamic = 'force-dynamic'

/**
 * Tag pages with fewer public articles than this are kept out of search indexes
 * (noindex, follow) and out of the sitemap: a one-article tag page is thin content that
 * competes with the article itself.
 */
const MIN_INDEXABLE_ARTICLES = 2

interface Props {
  params: { slug: string }
}

const loadTag = cache(async (slug: string) => {
  if (!isTagsEnabled()) return null
  const tag = await getTagBySlug(slug)
  if (!tag) return null
  const articles = await getArticlesByTag(slug)
  return { tag, articles }
})

function describe(name: string, titles: string[]): string {
  const list = titles.slice(0, 3).join(', ')
  const more = titles.length > 3 ? ` and ${titles.length - 3} more` : ''
  return `Nuvho Knowledge Base articles tagged ${name}${list ? `: ${list}${more}.` : '.'}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadTag(params.slug)
  if (!data) return {}
  const publicArticles = data.articles.filter(a => a.effectiveVisibility === 'public')
  const url = absoluteUrl(`/tags/${data.tag.slug}`)
  const description = describe(data.tag.name, publicArticles.map(a => a.title))
  return {
    title: `${data.tag.name} — ${SITE_NAME}`,
    description,
    keywords: [data.tag.name],
    alternates: { canonical: url },
    robots: publicArticles.length >= MIN_INDEXABLE_ARTICLES ? undefined : { index: false, follow: true },
    openGraph: { type: 'website', url, title: `${data.tag.name} — ${SITE_NAME}`, description, siteName: SITE_NAME, locale: 'en_AU' },
  }
}

export default async function TagPage({ params }: Props) {
  const [data, session, categories] = await Promise.all([loadTag(params.slug), getSession(), getCategories()])
  if (!data) notFound()

  const visible = data.articles.filter(a => canView(a.effectiveVisibility, !!session))
  // A tag used only by members-only articles doesn't exist for anonymous visitors
  if (visible.length === 0) notFound()

  const catMap = new Map(categories.map(c => [c.slug, { title: c.title, icon: c.icon }]))
  const publicArticles = data.articles.filter(a => a.effectiveVisibility === 'public')

  return (
    <div className="flex flex-col min-h-screen">
      {publicArticles.length > 0 && (
        <JsonLd data={collectionJsonLd(
          `/tags/${data.tag.slug}`,
          `${data.tag.name} — ${SITE_NAME}`,
          describe(data.tag.name, publicArticles.map(a => a.title)),
          publicArticles.map(a => ({ title: a.title, path: articlePath(a.categorySlug, a.slug) })),
        )} />
      )}
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title={data.tag.name}
          lede={`Every article tagged ${data.tag.name}.`}
          crumbs={[{ label: 'Knowledge Base', href: '/' }, { label: `Tag: ${data.tag.name}` }]}
          tags={
            <span className="nw-tag nw-tag--lg nw-tag--dark">
              <Icon name="tags" size={12} />
              {visible.length} {visible.length === 1 ? 'article' : 'articles'}
            </span>
          }
        />

        <section className="nw-section nw-section--tight">
          <div className="nw-wrap">
            <div className="nw-tiles">
              {visible.map(a => (
                <ArticleTile key={`${a.categorySlug}/${a.slug}`} article={a} category={catMap.get(a.categorySlug)} />
              ))}
            </div>

            <div className="mt-16">
              <Link href="/#topics" className="nw-link">
                <Icon name="arrow-left" size={14} />
                Back to all topics
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

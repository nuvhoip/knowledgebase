import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import Icon from '@/components/Icon'
import HelpfulVote from '@/components/HelpfulVote'
import ArticleToc from '@/components/ArticleToc'
import JsonLd from '@/components/JsonLd'
import TagList from '@/components/TagList'
import RelatedArticles from '@/components/RelatedArticles'
import { extractHero } from '@/components/heroImage'
import { buildToc, TOC_MIN_ENTRIES } from '@/lib/toc'
import { getCategoryBySlug, getArticleBySlug, getArticleTags, getRelatedArticles, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'
import { isTagsEnabled } from '@/lib/flags'
import { SITE_NAME, absoluteUrl, articleJsonLd, articlePath } from '@/lib/seo'
import type { Tag } from '@/lib/types'

// Force dynamic rendering — prevents Next.js from calling the DB during `next build`
// (DigitalOcean build containers have no DB access). New articles appear immediately
// without a redeploy.
export const dynamic = 'force-dynamic'

interface Props {
  params: { categorySlug: string; slug: string }
}

// generateMetadata and the page share one query per request
const loadArticle = cache(getArticleBySlug)
const loadTags = cache(async (categorySlug: string, slug: string): Promise<Tag[]> =>
  isTagsEnabled() ? getArticleTags(categorySlug, slug).catch(() => []) : []
)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await loadArticle(params.categorySlug, params.slug)
  if (!article) return {}
  const tags = await loadTags(params.categorySlug, params.slug)
  const { hero } = extractHero(article.content)
  const url = absoluteUrl(articlePath(article.categorySlug, article.slug))
  const isPublic = article.effectiveVisibility === 'public'
  return {
    title: `${article.title} — ${SITE_NAME}`,
    description: article.description,
    ...(tags.length ? { keywords: tags.map(t => t.name) } : {}),
    alternates: { canonical: url },
    // Members-only articles stay out of search engines and AI answers
    ...(isPublic ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      type: 'article',
      url,
      title: article.title,
      description: article.description,
      siteName: SITE_NAME,
      locale: 'en_AU',
      ...(article.updatedAtIso ? { modifiedTime: article.updatedAtIso } : {}),
      ...(article.categoryTitle ? { section: article.categoryTitle } : {}),
      ...(tags.length ? { tags: tags.map(t => t.name) } : {}),
      ...(hero ? { images: [{ url: hero.src, alt: hero.alt || article.title }] } : {}),
    },
    twitter: {
      card: hero ? 'summary_large_image' : 'summary',
      title: article.title,
      description: article.description,
      ...(hero ? { images: [hero.src] } : {}),
    },
  }
}

// Article page: the Figma photo hero (when the article carries a hero image, else the
// gradient hero) over the centred reader card — content focused in the middle, as before.
export default async function ArticlePage({ params }: Props) {
  const tagsOn = isTagsEnabled()
  const [article, category, session, tags, related] = await Promise.all([
    loadArticle(params.categorySlug, params.slug),
    getCategoryBySlug(params.categorySlug),
    getSession(),
    loadTags(params.categorySlug, params.slug),
    tagsOn ? getRelatedArticles(params.categorySlug, params.slug).catch(() => []) : Promise.resolve([]),
  ])
  const canEdit = !!session?.email.endsWith('@nuvho.com')
  if (!article || !category) notFound()

  if (!canView(article.effectiveVisibility, !!session)) {
    redirect(`/login?next=${encodeURIComponent(`/articles/${params.categorySlug}/${params.slug}`)}`)
  }

  const { hero, body } = extractHero(article.content)
  // Heading ids are added to the rendered copy only; the stored HTML is unchanged (lib/toc.ts)
  const toc = buildToc(body)
  const showToc = toc.count >= TOC_MIN_ENTRIES
  const visibleRelated = related.filter(a => canView(a.effectiveVisibility, !!session)).slice(0, 4)
  const isPublic = article.effectiveVisibility === 'public'

  return (
    <div className="flex flex-col min-h-screen">
      {/* Structured data for search engines and AI answer engines — public articles only */}
      {isPublic && (
        <JsonLd data={articleJsonLd({
          title: article.title,
          description: article.description,
          categorySlug: category.slug,
          slug: article.slug,
          categoryTitle: category.title,
          updatedIso: article.updatedAtIso,
          readTime: article.readTime,
          html: body,
          heroSrc: hero?.src,
          tags,
        })} />
      )}
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title={article.title}
          image={hero}
          crumbs={[
            { label: 'Knowledge Base', href: '/' },
            { label: category.title, href: `/categories/${category.slug}` },
            { label: article.title },
          ]}
          tags={
            <>
              <span className="nw-tag nw-tag--lg nw-tag--dark"><Icon name={category.icon} size={12} />{category.title}</span>
              {article.effectiveVisibility === 'private' && (
                <span className="nw-tag nw-tag--lg nw-tag--dark"><Icon name="lock" size={11} />Members only</span>
              )}
            </>
          }
          meta={
            <>
              <span><Icon name="clock" size={13} onDark /> {article.readTime} min read</span>
              <span>Updated {article.updatedAtIso
                ? <time dateTime={article.updatedAtIso}>{article.updatedAt}</time>
                : article.updatedAt}</span>
            </>
          }
        />

        <section className="nw-section nw-section--band nw-section--tight">
          <div className={`nw-wrap${showToc ? ' nw-article-layout' : ''}`}>
            {/* Left of the article, and first in the markup so tab and reading order match the layout */}
            {showToc && (
              <aside className="nw-article-aside">
                <ArticleToc entries={toc.entries} variant="side" />
              </aside>
            )}
            <article className="nw-reader">
              {canEdit && (
                <div className="nw-article__bar">
                  <span className="nw-count" style={{ margin: 0 }}>Staff view</span>
                  <Link href={`/articles/${params.categorySlug}/${params.slug}/edit`} className="nv-btn nv-btn--secondary">
                    <Icon name="pen-to-square" size={16} />
                    Edit article
                  </Link>
                </div>
              )}

              <p className="nw-article__lede">{article.description}</p>

              <TagList tags={tags} />

              {showToc && <ArticleToc entries={toc.entries} variant="inline" />}

              {body.trim() ? (
                <div className="nw-prose" dangerouslySetInnerHTML={{ __html: toc.html }} />
              ) : (
                <div className="nw-prose">
                  <h2>Overview</h2>
                  <p>
                    This article covers everything you need to know about <strong>{article.title.toLowerCase()}</strong>.
                    Follow the steps below to get started quickly.
                  </p>
                  <div className="nw-callout">
                    <Icon name="lightbulb" size={24} />
                    <div>
                      <strong>Tip</strong>
                      <p>
                        If you run into any issues, our support team is available via live chat in your Nuvho dashboard.
                        You can also email <a href="mailto:support@nuvho.com">support@nuvho.com</a>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <HelpfulVote />

              <RelatedArticles articles={visibleRelated} />

              <div className="mt-10">
                <Link href={`/categories/${category.slug}`} className="nw-link">
                  <Icon name="arrow-left" size={14} />
                  Back to {category.title}
                </Link>
              </div>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

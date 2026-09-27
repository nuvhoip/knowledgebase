import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import Icon from '@/components/Icon'
import HelpfulVote from '@/components/HelpfulVote'
import { extractHero } from '@/components/heroImage'
import { getCategoryBySlug, getArticleBySlug, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'

// Force dynamic rendering — prevents Next.js from calling the DB during `next build`
// (DigitalOcean build containers have no DB access). New articles appear immediately
// without a redeploy.
export const dynamic = 'force-dynamic'

interface Props {
  params: { categorySlug: string; slug: string }
}

export async function generateMetadata({ params }: Props) {
  const article = await getArticleBySlug(params.categorySlug, params.slug)
  if (!article) return {}
  const { hero } = extractHero(article.content)
  return {
    title: `${article.title} — Nuvho Knowledge Base`,
    description: article.description,
    ...(hero ? { openGraph: { images: [hero.src] } } : {}),
  }
}

// Article page: the Figma photo hero (when the article carries a hero image, else the
// gradient hero) over the centred reader card — content focused in the middle, as before.
export default async function ArticlePage({ params }: Props) {
  const [article, category, session] = await Promise.all([
    getArticleBySlug(params.categorySlug, params.slug),
    getCategoryBySlug(params.categorySlug),
    getSession(),
  ])
  const canEdit = !!session?.email.endsWith('@nuvho.com')
  if (!article || !category) notFound()

  if (!canView(article.effectiveVisibility, !!session)) {
    redirect(`/login?next=${encodeURIComponent(`/articles/${params.categorySlug}/${params.slug}`)}`)
  }

  const { hero, body } = extractHero(article.content)

  return (
    <div className="flex flex-col min-h-screen">
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
              <span>Updated {article.updatedAt}</span>
            </>
          }
        />

        <section className="nw-section nw-section--band nw-section--tight">
          <div className="nw-wrap">
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

              {body.trim() ? (
                <div className="nw-prose" dangerouslySetInnerHTML={{ __html: body }} />
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

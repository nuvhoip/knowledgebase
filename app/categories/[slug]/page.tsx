import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import Icon from '@/components/Icon'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import EmptyState from '@/components/EmptyState'
import { getCategoryBySlug, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'

// Force dynamic rendering — prevents Next.js from calling the DB during `next build`
// (DigitalOcean build containers have no DB access). New categories appear immediately
// without a redeploy.
export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props) {
  const category = await getCategoryBySlug(params.slug)
  if (!category) return {}
  return {
    title: `${category.title} — Nuvho Knowledge Base`,
    description: category.description,
  }
}

export default async function CategoryPage({ params }: Props) {
  const [category, session] = await Promise.all([
    getCategoryBySlug(params.slug),
    getSession(),
  ])
  if (!category) notFound()

  const hasSession = !!session
  if (!canView(category.visibility, hasSession)) {
    redirect(`/login?next=${encodeURIComponent(`/categories/${params.slug}`)}`)
  }

  // Group visible articles by sub-category. Sub-categories (or individual articles)
  // that resolve to Private are hidden from anonymous visitors even though the
  // category itself is visible.
  const groups = category.subcategories
    .map(sub => ({
      slug: sub.slug,
      title: sub.title,
      articles: sub.articles.filter(a => canView(a.effectiveVisibility, hasSession)),
    }))
    .filter((sub, i) => canView(category.subcategories[i].visibility ?? category.visibility, hasSession) && sub.articles.length > 0)

  const total = groups.reduce((n, g) => n + g.articles.length, 0)

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title={category.title}
          lede={category.description}
          crumbs={[{ label: 'Knowledge Base', href: '/' }, { label: category.title }]}
          tags={
            <>
              <span className="nw-tag nw-tag--lg nw-tag--dark">
                <Icon name={category.icon} size={12} />
                {total} {total === 1 ? 'article' : 'articles'}
              </span>
              {category.visibility === 'private' && (
                <span className="nw-tag nw-tag--lg nw-tag--dark"><Icon name="lock" size={11} />Members only</span>
              )}
            </>
          }
        />

        <section className="nw-section nw-section--tight">
          <div className="nw-wrap">
            {groups.length === 0 ? (
              <EmptyState
                icon="folder-open"
                title="No articles here yet"
                body="This topic is set up but nothing has been published under it. Check back soon."
                action={<Link href="/#topics" className="nv-btn nv-btn--secondary nv-btn--lg">Browse other topics</Link>}
              />
            ) : (
              <SubcategoryFilter groups={groups} category={{ title: category.title, icon: category.icon }} />
            )}

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

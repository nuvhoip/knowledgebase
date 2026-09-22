import SiteHeader from '@/components/SiteHeader'
import HomeHero from '@/components/HomeHero'
import FeaturedArticle from '@/components/FeaturedArticle'
import ArticleTile from '@/components/ArticleTile'
import TopicGrid from '@/components/TopicGrid'
import ContactBand from '@/components/ContactBand'
import Footer from '@/components/Footer'
import { getFeaturedArticles, getCategories, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Home follows the Figma Blog/Resources anatomy: hero (with search) → featured band →
// topic grid (service cards) → conversion band → footer 512.
export default async function HomePage() {
  const [featured, categories, session] = await Promise.all([
    getFeaturedArticles(4),
    getCategories(),
    getSession(),
  ])
  const hasSession = !!session

  // Anonymous visitors never see Private categories or featured articles listed here —
  // the article/category pages themselves redirect them to /login.
  const visibleFeatured = featured.filter(a => canView(a.effectiveVisibility, hasSession))
  const visibleCategories = categories.filter(c => canView(c.visibility, hasSession))
  const catMap = new Map(categories.map(c => [c.slug, { title: c.title, icon: c.icon }]))
  const [lead, ...rest] = visibleFeatured

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1">
        <HomeHero />

        {lead && (
          <section className="nw-section nw-section--band" id="popular">
            <div className="nw-wrap">
              <FeaturedArticle article={lead} category={catMap.get(lead.categorySlug)} />
              {rest.length > 0 && (
                <div className="nw-tiles mt-12">
                  {rest.map(a => (
                    <ArticleTile key={`${a.categorySlug}/${a.slug}`} article={a} category={catMap.get(a.categorySlug)} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="nw-section" id="topics">
          <div className="nw-wrap">
            <h2 className="nw-h2">Browse by topic</h2>
            <p className="nw-intro">Every guide lives under one of these topics. Pick the area you are working in.</p>
            <div className="nw-rule" aria-hidden="true" />
            <TopicGrid categories={visibleCategories} />
          </div>
        </section>

        <ContactBand />
      </main>
      <Footer />
    </div>
  )
}

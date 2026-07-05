import Header from '@/components/Header'
import SearchHero from '@/components/SearchHero'
import CategoryGrid from '@/components/CategoryGrid'
import Footer from '@/components/Footer'
import ArticleCard from '@/components/ArticleCard'
import { getFeaturedArticles, getCategories, canView } from '@/lib/data'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [featured, categories, session] = await Promise.all([
    getFeaturedArticles(4),
    getCategories(),
    getSession(),
  ])
  const hasSession = !!session

  // Anonymous visitors never see Private categories or featured articles listed here —
  // they can still reach a Private article's URL, but the article/category page itself
  // will redirect them to /login (see those pages for the actual gate).
  const visibleFeatured = featured.filter(a => canView(a.effectiveVisibility, hasSession))
  const visibleCategories = categories.filter(c => canView(c.visibility, hasSession))

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <SearchHero />

        {/* Featured / Popular articles */}
        {visibleFeatured.length > 0 && (
          <section className="bg-[#F7F8F9] border-b border-platinum">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              <h2 className="font-heading text-lg font-semibold text-iron-grey mb-5">
                Popular articles
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visibleFeatured.map(article => (
                  <ArticleCard key={article.slug} article={article} showCategory />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Category grid */}
        <CategoryGrid categories={visibleCategories} />
      </main>
      <Footer />
    </div>
  )
}

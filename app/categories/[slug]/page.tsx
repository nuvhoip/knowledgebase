import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ArticleCard from '@/components/ArticleCard'
import { categories, getCategoryBySlug } from '@/lib/data'

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  return categories.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props) {
  const category = getCategoryBySlug(params.slug)
  if (!category) return {}
  return {
    title: `${category.title} — Nuvho Knowledge Base`,
    description: category.description,
  }
}

export default function CategoryPage({ params }: Props) {
  const category = getCategoryBySlug(params.slug)
  if (!category) notFound()

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-platinum">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center gap-2 text-sm font-body text-gray-400">
              <Link href="/" className="hover:text-blue-slate transition-colors">Knowledge Base</Link>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-iron-grey font-medium">{category.title}</span>
            </nav>
          </div>
        </div>

        {/* Category header */}
        <section className="bg-white border-b border-platinum pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0 w-14 h-14 bg-tropical-teal/10 rounded-2xl flex items-center justify-center">
                <Image
                  src={`/icons/${category.icon}`}
                  alt={category.title}
                  width={32}
                  height={32}
                  className="icon-primary"
                />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold text-iron-grey">{category.title}</h1>
                <p className="font-body text-gray-500 mt-1 max-w-2xl">{category.description}</p>
                <span className="inline-block mt-2 text-sm text-steel-blue font-body">
                  {category.articleCount} articles
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Articles list */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {category.articles.map(article => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>

          {/* Back link */}
          <div className="mt-10">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-blue-slate hover:text-steel-blue
                         font-body transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 18l-6-6 6-6" />
              </svg>
              Back to all topics
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

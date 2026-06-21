import { notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { categories, getCategoryBySlug, getArticleBySlug } from '@/lib/data'

interface Props {
  params: { categorySlug: string; slug: string }
}

export async function generateStaticParams() {
  return categories.flatMap(c =>
    c.articles.map(a => ({ categorySlug: c.slug, slug: a.slug }))
  )
}

export async function generateMetadata({ params }: Props) {
  const article = getArticleBySlug(params.categorySlug, params.slug)
  if (!article) return {}
  return {
    title: `${article.title} — Nuvho Knowledge Base`,
    description: article.description,
  }
}

export default function ArticlePage({ params }: Props) {
  const article = getArticleBySlug(params.categorySlug, params.slug)
  const category = getCategoryBySlug(params.categorySlug)
  if (!article || !category) notFound()

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-platinum">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center gap-2 text-sm font-body text-gray-400 flex-wrap">
              <Link href="/" className="hover:text-blue-slate transition-colors">Knowledge Base</Link>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <Link href={`/categories/${category.slug}`} className="hover:text-blue-slate transition-colors">
                {category.title}
              </Link>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-iron-grey font-medium truncate max-w-[200px]">{article.title}</span>
            </nav>
          </div>
        </div>

        {/* Article */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="nuvho-card p-8 sm:p-10">
            {/* Meta */}
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full bg-tropical-teal/10 text-blue-slate text-xs font-heading font-semibold">
                {category.title}
              </span>
              <span className="text-xs text-gray-400 font-body">{article.readTime} min read</span>
              <span className="text-xs text-gray-400 font-body">Updated {article.updatedAt}</span>
            </div>

            {/* Title */}
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-iron-grey mb-4 leading-tight">
              {article.title}
            </h1>

            <p className="font-body text-gray-600 text-base mb-8 leading-relaxed border-l-4 border-tropical-teal pl-4">
              {article.description}
            </p>

            {/* Placeholder content */}
            <div className="prose prose-sm max-w-none font-body text-gray-600 space-y-4">
              <h2 className="font-heading text-lg font-semibold text-iron-grey">Overview</h2>
              <p>
                This article covers everything you need to know about <strong>{article.title.toLowerCase()}</strong>.
                Follow the steps below to get started quickly and efficiently.
              </p>

              <h2 className="font-heading text-lg font-semibold text-iron-grey mt-6">Steps</h2>
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Log in to your Nuvho dashboard at <a href="https://app.nuvho.com" className="text-blue-slate hover:underline">app.nuvho.com</a></li>
                <li>Navigate to the relevant section in the left sidebar</li>
                <li>Follow the on-screen instructions to complete the configuration</li>
                <li>Save your changes and verify the setup is working correctly</li>
              </ol>

              <div className="bg-tropical-teal/8 border border-tropical-teal/20 rounded-xl p-4 mt-6">
                <p className="text-sm font-semibold text-blue-slate font-heading mb-1">💡 Tip</p>
                <p className="text-sm text-gray-600">
                  If you run into any issues, our support team is available via live chat in your Nuvho dashboard.
                  You can also email <a href="mailto:support@nuvho.com" className="text-blue-slate hover:underline">support@nuvho.com</a>.
                </p>
              </div>
            </div>

            {/* Was this helpful? */}
            <div className="mt-10 pt-8 border-t border-platinum">
              <p className="font-heading font-semibold text-iron-grey mb-3">Was this article helpful?</p>
              <div className="flex items-center gap-3">
                <button className="btn-primary text-sm py-2 px-5">👍  Yes</button>
                <button className="btn-outline text-sm py-2 px-5">👎  No</button>
              </div>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-6">
            <Link
              href={`/categories/${category.slug}`}
              className="inline-flex items-center gap-2 text-sm text-blue-slate hover:text-steel-blue
                         font-body transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 18l-6-6 6-6" />
              </svg>
              Back to {category.title}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

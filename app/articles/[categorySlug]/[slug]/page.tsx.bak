import { notFound } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getCategoryBySlug, getArticleBySlug } from '@/lib/data'
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
  return {
    title: `${article.title} — Nuvho Knowledge Base`,
    description: article.description,
  }
}

export default async function ArticlePage({ params }: Props) {
  const [article, category, session] = await Promise.all([
    getArticleBySlug(params.categorySlug, params.slug),
    getCategoryBySlug(params.categorySlug),
    getSession(),
  ])
  const canEdit = !!session?.email.endsWith('@nuvho.com')
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
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-tropical-teal/10 text-blue-slate text-xs font-heading font-semibold">
                {category.title}
              </span>
              <span className="text-xs text-gray-400 font-body">{article.readTime} min read</span>
              <span className="text-xs text-gray-400 font-body">Updated {article.updatedAt}</span>

              {canEdit && (
                <Link
                  href={`/articles/${params.categorySlug}/${params.slug}/edit`}
                  className="ml-auto flex items-center gap-1.5 text-xs font-heading font-semibold
                             text-blue-slate border border-blue-slate/30 rounded-full px-3 py-1
                             hover:bg-blue-slate hover:text-white transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Article
                </Link>
              )}
            </div>

            {/* Title */}
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-iron-grey mb-4 leading-tight">
              {article.title}
            </h1>

            <p className="font-body text-gray-600 text-base mb-8 leading-relaxed border-l-4 border-tropical-teal pl-4">
              {article.description}
            </p>

            {/* Article body */}
            {article.content ? (
              <div
                className="prose prose-sm max-w-none font-body text-gray-600
                           [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-iron-grey [&_h2]:mt-8 [&_h2]:mb-3
                           [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-iron-grey [&_h3]:mt-6 [&_h3]:mb-2
                           [&_p]:leading-relaxed [&_p]:mb-4
                           [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:mb-4
                           [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-2 [&_ol]:mb-4
                           [&_li]:leading-relaxed
                           [&_a]:text-blue-slate [&_a]:hover:underline
                           [&_pre]:bg-gray-50 [&_pre]:border [&_pre]:border-platinum [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:mb-4 [&_pre]:overflow-x-auto
                           [&_code]:font-mono [&_code]:text-sm [&_code]:text-iron-grey"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            ) : (
              <div className="prose prose-sm max-w-none font-body text-gray-600 space-y-4">
                <h2 className="font-heading text-lg font-semibold text-iron-grey">Overview</h2>
                <p>
                  This article covers everything you need to know about <strong>{article.title.toLowerCase()}</strong>.
                  Follow the steps below to get started quickly and efficiently.
                </p>
                <div className="bg-tropical-teal/8 border border-tropical-teal/20 rounded-xl p-4 mt-6">
                  <p className="text-sm font-semibold text-blue-slate font-heading mb-1">💡 Tip</p>
                  <p className="text-sm text-gray-600">
                    If you run into any issues, our support team is available via live chat in your Nuvho dashboard.
                    You can also email <a href="mailto:support@nuvho.com" className="text-blue-slate hover:underline">support@nuvho.com</a>.
                  </p>
                </div>
              </div>
            )}

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

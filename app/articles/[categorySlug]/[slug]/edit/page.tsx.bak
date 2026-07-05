import { redirect, notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getSession } from '@/lib/auth'
import { getCategoryBySlug, getArticleBySlug } from '@/lib/data'
import ArticleEditForm from './ArticleEditForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: { categorySlug: string; slug: string }
}

export async function generateMetadata({ params }: Props) {
  const article = await getArticleBySlug(params.categorySlug, params.slug)
  if (!article) return {}
  return { title: `Edit: ${article.title} — Nuvho KB` }
}

export default async function ArticleEditPage({ params }: Props) {
  // Auth guard — @nuvho.com only
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    redirect('/login')
  }

  const [article, category] = await Promise.all([
    getArticleBySlug(params.categorySlug, params.slug),
    getCategoryBySlug(params.categorySlug),
  ])
  if (!article || !category) notFound()

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-platinum">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center gap-2 text-sm font-body text-gray-400 flex-wrap">
              <a href="/" className="hover:text-blue-slate transition-colors">Knowledge Base</a>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <a href={`/categories/${category.slug}`} className="hover:text-blue-slate transition-colors">
                {category.title}
              </a>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <a href={`/articles/${category.slug}/${article.slug}`} className="hover:text-blue-slate transition-colors truncate max-w-[160px]">
                {article.title}
              </a>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-iron-grey font-medium">Edit</span>
            </nav>
          </div>
        </div>

        {/* Edit form */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="nuvho-card p-8 sm:p-10">
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full bg-tropical-teal/10 text-blue-slate text-xs font-heading font-semibold">
                {category.title}
              </span>
              <span className="text-xs text-gray-400 font-body">Editing as {session.email}</span>
            </div>

            <h1 className="font-heading text-2xl font-bold text-iron-grey mb-8">Edit Article</h1>

            <ArticleEditForm
              categorySlug={params.categorySlug}
              slug={params.slug}
              initialTitle={article.title}
              initialDescription={article.description}
              initialContent={article.content ?? ''}
              initialReadTime={article.readTime}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

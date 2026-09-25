import { redirect, notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import Icon from '@/components/Icon'
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
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title="Edit article"
          lede={article.title}
          crumbs={[
            { label: 'Knowledge Base', href: '/' },
            { label: category.title, href: `/categories/${category.slug}` },
            { label: article.title, href: `/articles/${category.slug}/${article.slug}` },
            { label: 'Edit' },
          ]}
          tags={<span className="nw-tag nw-tag--lg nw-tag--dark"><Icon name={category.icon} size={12} />{category.title}</span>}
          meta={<span>Editing as {session.email}</span>}
        />

        {/* Same band + centred reader card as the article page, so the editor sits where the article renders */}
        <section className="nw-section nw-section--band nw-section--tight">
          <div className="nw-wrap">
            <div className="nw-reader">
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
        </section>
      </main>
      <Footer />
    </div>
  )
}

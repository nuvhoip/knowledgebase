import { notFound, redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import InnerHero from '@/components/InnerHero'
import ArticleTile from '@/components/ArticleTile'
import Icon from '@/components/Icon'
import { injectHero } from '@/components/heroImage'
import { getSession } from '@/lib/auth'
import { getCategoryBySlug, getArticleBySlug } from '@/lib/data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Hero preview — Nuvho KB', robots: { index: false, follow: false } }

interface Props {
  params: { categorySlug: string; slug: string }
  searchParams: { src?: string; alt?: string; title?: string; desc?: string }
}

/** Only site-relative paths (/uploads/…) and http(s) URLs are rendered. */
function safeSrc(src: string | undefined): string {
  const s = (src ?? '').trim()
  if (s.startsWith('/') && !s.startsWith('//')) return s
  return /^https?:\/\//i.test(s) ? s : ''
}

const clip = (s: string | undefined, max: number) => (s ?? '').slice(0, max)

// Hero preview for the image library picker (components/ImageLibraryPicker.tsx), loaded in
// an iframe at desktop or phone width so the real breakpoints apply. Renders the article
// hero exactly as the article page does, with the title/description from the unsaved edit
// form, then the article tile. Nothing is saved. Staff only.
export default async function HeroPreviewPage({ params, searchParams }: Props) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) redirect('/login')

  const [article, category] = await Promise.all([
    getArticleBySlug(params.categorySlug, params.slug),
    getCategoryBySlug(params.categorySlug),
  ])
  if (!article || !category) notFound()

  const src = safeSrc(searchParams.src)
  const alt = clip(searchParams.alt, 300)
  const title = clip(searchParams.title, 300).trim() || article.title
  const description = clip(searchParams.desc, 1000).trim() || article.description
  const hero = src ? { src, alt } : null

  const tileArticle = { ...article, title, description, content: injectHero('', src, alt) }

  return (
    <div className="flex flex-col min-h-screen nw-preview-frame">
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title={title}
          image={hero}
          crumbs={[
            { label: 'Knowledge Base', href: '/' },
            { label: category.title, href: `/categories/${category.slug}` },
            { label: title },
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
            <div className="nw-reader">
              <p className="nw-article__lede">{description}</p>
            </div>
            <p className="nw-preview-label">On article tiles</p>
            <div className="nw-tiles">
              <ArticleTile article={tileArticle} category={{ title: category.title, icon: category.icon }} />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

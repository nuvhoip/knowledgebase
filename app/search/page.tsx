import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import SearchForm from '@/components/SearchForm'
import SearchResults from './SearchResults'
import { getCategories } from '@/lib/data'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Search — Nuvho Knowledge Base',
}

interface Props {
  searchParams: { q?: string }
}

export default async function SearchPage({ searchParams }: Props) {
  const q = (searchParams.q ?? '').trim()
  const categories = await getCategories()
  const catMap = Object.fromEntries(categories.map(c => [c.slug, { title: c.title, icon: c.icon }]))

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1">
        <InnerHero
          title={q ? `Results for “${q}”` : 'Search the Knowledge Base'}
          crumbs={[{ label: 'Knowledge Base', href: '/' }, { label: 'Search' }]}
        >
          <div className="nw-hero__search">
            <SearchForm key={q} initial={q} autoFocus={!q} />
          </div>
        </InnerHero>

        <section className="nw-section nw-section--tight">
          <div className="nw-wrap">
            <SearchResults query={q} categories={catMap} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

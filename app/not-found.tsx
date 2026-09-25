import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import Footer from '@/components/Footer'
import InnerHero from '@/components/InnerHero'
import EmptyState from '@/components/EmptyState'

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />
      <main className="flex-1">
        <InnerHero title="Page not found" crumbs={[{ label: 'Knowledge Base', href: '/' }, { label: 'Not found' }]} />
        <section className="nw-section nw-section--tight">
          <div className="nw-wrap">
            <EmptyState
              icon="circle-question"
              title="That page has moved or never existed"
              body="The article or page you were looking for is not here. Try a search, or start again from the topics."
              action={<Link href="/" className="nv-btn">Back to the Knowledge Base</Link>}
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

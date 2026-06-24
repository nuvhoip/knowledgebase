'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ArticleCard from '@/components/ArticleCard'
import Link from 'next/link'
import { Article } from '@/lib/types'

function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const [results, setResults] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => setResults(data.articles ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [query])

  return (
    <main className="flex-1">
      <div className="bg-white border-b border-platinum">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav className="flex items-center gap-2 text-sm font-body text-gray-400 mb-4">
            <Link href="/" className="hover:text-blue-slate transition-colors">Knowledge Base</Link>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-iron-grey font-medium">Search results</span>
          </nav>
          <h1 className="font-heading text-2xl font-bold text-iron-grey">
            {query ? `Results for "${query}"` : 'Search'}
          </h1>
          {!loading && results.length > 0 && (
            <p className="font-body text-gray-500 mt-1">{results.length} article{results.length !== 1 ? 's' : ''} found</p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-steel-blue font-body">Searching…</div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map(a => (
              <ArticleCard key={`${a.categorySlug}-${a.slug}`} article={a} showCategory />
            ))}
          </div>
        ) : query ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-tropical-teal/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-steel-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>
            <h2 className="font-heading text-lg font-semibold text-iron-grey mb-2">No results found</h2>
            <p className="font-body text-gray-500 mb-6">
              We couldn&apos;t find anything matching <strong>&quot;{query}&quot;</strong>. Try different keywords.
            </p>
            <Link href="/" className="btn-primary inline-block">Browse all topics</Link>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-steel-blue font-body">Loading…</div>}>
        <SearchResults />
      </Suspense>
      <Footer />
    </div>
  )
}

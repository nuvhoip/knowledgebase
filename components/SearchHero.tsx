'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchHero() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <section className="bg-white border-b border-platinum">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-iron-grey mb-3">
          Find answers to your questions
        </h1>
        <p className="font-body text-steel-blue text-lg mb-10">
          Guides, tutorials, and documentation for Smart Hoteliers
        </p>

        <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
          <div className="relative flex items-center">
            {/* Search icon */}
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel-blue pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>

            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search articles, guides, and FAQs…"
              className="search-input pl-12 pr-36"
              autoComplete="off"
            />

            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary text-sm py-2 px-5"
            >
              Search
            </button>
          </div>
        </form>

        {/* Popular searches */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm text-gray-400 font-body">Popular:</span>
          {['Booking engine setup', 'PMS integration', 'Dynamic pricing', 'API keys'].map(term => (
            <button
              key={term}
              onClick={() => {
                setQuery(term)
                router.push(`/search?q=${encodeURIComponent(term)}`)
              }}
              className="text-sm text-blue-slate hover:text-steel-blue font-body underline underline-offset-2
                         decoration-tropical-teal/50 hover:decoration-blue-slate transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

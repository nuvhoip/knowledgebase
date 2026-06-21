import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center py-20 px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-tropical-teal/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-steel-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 0 1 5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-iron-grey mb-2">Page not found</h1>
          <p className="font-body text-gray-500 mb-8">
            The article or page you're looking for doesn't exist or has been moved.
          </p>
          <Link href="/" className="btn-primary inline-block">
            Back to Knowledge Base
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}

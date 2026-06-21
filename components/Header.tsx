'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="bg-blue-slate shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 flex-shrink-0">
            <Image
              src="/logo-white.svg"
              alt="Nuvho"
              width={140}
              height={36}
              priority
              className="h-9 w-auto"
            />
          </Link>

          {/* Right nav */}
          <nav className="hidden sm:flex items-center gap-3">
            <Link
              href="https://nuvho.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white font-body text-sm transition-colors"
            >
              Nuvho.com
            </Link>
            <Link
              href="https://app.nuvho.com/login"
              className="btn-outline-white text-sm py-2 px-5"
            >
              Login
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="sm:hidden bg-blue-slate/95 border-t border-white/10 px-4 py-4 space-y-3">
          <Link href="https://nuvho.com" className="block text-white/80 hover:text-white text-sm py-1">
            Nuvho.com
          </Link>
          <Link href="https://app.nuvho.com/login" className="btn-outline-white text-sm inline-block">
            Login
          </Link>
        </div>
      )}
    </header>
  )
}

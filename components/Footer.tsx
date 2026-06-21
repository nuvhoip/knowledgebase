import Image from 'next/image'
import Link from 'next/link'

const socialLinks = [
  { label: 'LinkedIn', href: 'https://linkedin.com/company/nuvho', icon: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )},
  { label: 'Facebook', href: 'https://facebook.com/nuvho', icon: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )},
  { label: 'Instagram', href: 'https://instagram.com/nuvho', icon: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  )},
]

export default function Footer() {
  return (
    <footer className="bg-iron-grey text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center sm:items-start gap-2">
            <Image
              src="/logo-white.svg"
              alt="Nuvho"
              width={120}
              height={30}
              className="h-8 w-auto"
            />
            <p className="font-body text-xs text-white/60 mt-1">
              Smart Hoteliers
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col sm:flex-row gap-6 text-sm font-body text-white/70">
            <div>
              <p className="font-heading font-semibold text-white/90 mb-2 text-xs uppercase tracking-wider">
                Knowledge Base
              </p>
              <ul className="space-y-1">
                <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                <li><Link href="/categories/getting-started" className="hover:text-white transition-colors">Getting Started</Link></li>
                <li><Link href="/categories/booking-engine" className="hover:text-white transition-colors">Booking Engine</Link></li>
                <li><Link href="/categories/support" className="hover:text-white transition-colors">Support & FAQs</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-heading font-semibold text-white/90 mb-2 text-xs uppercase tracking-wider">
                Company
              </p>
              <ul className="space-y-1">
                <li><a href="https://nuvho.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Nuvho.com</a></li>
                <li><a href="https://nuvho.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="https://nuvho.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          {/* Social */}
          <div className="flex items-center gap-3">
            {socialLinks.map(s => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-tropical-teal/40 flex items-center
                           justify-center text-white/70 hover:text-white transition-all"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-6 text-center text-xs text-white/40 font-body">
          © Nuvho Systems Pty Ltd {new Date().getFullYear()}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Login failed.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nv-auth">
      {/* Brand panel — §11 split screen, hidden below 900px */}
      <aside className="nv-auth__brand">
        <div className="nv-auth__sheet nv-auth__sheet--a" />
        <div className="nv-auth__sheet nv-auth__sheet--b" />
        <div className="nv-auth__sheet nv-auth__sheet--focal" />

        <div className="nv-auth__brand-inner">
          <Link href="/" className="inline-block">
            <Image
              src="/logo-white.svg"
              alt="Nuvho"
              width={200}
              height={54}
              className="nv-auth__brand-logo"
              priority
            />
          </Link>
          <h2 className="nv-auth__hero">Answers, close at hand.</h2>
          <p className="nv-auth__sub">
            Guides, tutorials and documentation for Smart Hoteliers — organised so
            your team finds the right answer first time.
          </p>
        </div>

        <p className="nv-auth__brand-footer">&copy; Nuvho Systems Pty Ltd</p>
      </aside>

      {/* Form panel */}
      <main className="nv-auth__panel">
        <Link href="/" className="nv-auth__mobile-logo">
          <Image src="/logo-primary.svg" alt="Nuvho" width={44} height={44} priority />
        </Link>

        <div className="nv-auth__card">
          <h1 className="nv-auth__title">Sign in</h1>
          <p className="nv-auth__lede">Welcome back to the Nuvho Knowledge Base.</p>

          {error && (
            <div className="nv-auth__error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="nv-auth__form">
            <div className="nv-auth__group">
              <label className="nv-auth__label" htmlFor="email">
                Email address <span className="nv-auth__req">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="nv-auth__field"
                placeholder="you@nuvho.com"
              />
            </div>

            <div className="nv-auth__group">
              <label className="nv-auth__label" htmlFor="password">
                Password <span className="nv-auth__req">*</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="nv-auth__field"
                placeholder="Enter your password"
              />
            </div>

            <div className="nv-auth__actions">
              <button type="submit" disabled={loading} className="nv-auth__btn">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>

          <p className="nv-auth__foot">
            Don&apos;t have an account? <Link href="/signup">Create one</Link>
          </p>
        </div>

        <p className="nv-auth__panel-footer">&copy; Nuvho Systems Pty Ltd</p>
      </main>
    </div>
  )
}

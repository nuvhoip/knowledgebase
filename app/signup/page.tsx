'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Sign up failed.')
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
          <h2 className="nv-auth__hero">Start with the answer.</h2>
          <p className="nv-auth__sub">
            Create an account to save what matters, follow the guides that apply to
            your property and keep your team on the same page.
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
          <h1 className="nv-auth__title">Create an account</h1>
          <p className="nv-auth__lede">Join the Nuvho Knowledge Base.</p>

          {error && (
            <div className="nv-auth__error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="nv-auth__form">
            <div className="nv-auth__group">
              <label className="nv-auth__label" htmlFor="name">
                Full name <span className="nv-auth__req">*</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="nv-auth__field"
                placeholder="Jane Smith"
              />
            </div>

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
                autoComplete="new-password"
                required
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="nv-auth__field"
                placeholder="Create a password"
              />
              <p className="nv-auth__help">Use at least 8 characters.</p>
            </div>

            <div className="nv-auth__actions">
              <button type="submit" disabled={loading} className="nv-auth__btn">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <p className="nv-auth__foot">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>

        <p className="nv-auth__panel-footer">&copy; Nuvho Systems Pty Ltd</p>
      </main>
    </div>
  )
}

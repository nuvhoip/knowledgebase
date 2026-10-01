'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import MicrosoftSignInButton, { MicrosoftClientConfig } from '@/components/MicrosoftSignInButton'

interface Props {
  /** null when the AZURE_* env vars are unset — the Microsoft button is hidden, as in onboarding. */
  microsoft: MicrosoftClientConfig | null
}

export default function LoginForm({ microsoft }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [microsoftBusy, setMicrosoftBusy] = useState(false)
  // Which button signed in — its spinner stays up while the home page loads with the session
  const [redirectingVia, setRedirectingVia] = useState<'password' | 'microsoft' | null>(null)
  const busy = loading || microsoftBusy || redirectingVia !== null

  function onSignedIn(via: 'password' | 'microsoft') {
    setRedirectingVia(via)
    router.push('/')
    router.refresh()
  }

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
        onSignedIn('password')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Same UI as nuvho-onboarding-ui (src/pages/Login.jsx): logo → password card →
  // "Staff & Admin" divider → Sign in with Microsoft → copyright.
  return (
    <div className="nv-auth">
      <main className="nv-auth__col">
        <Link href="/" className="nv-auth__logo">
          <Image src="/logo-primary.svg" alt="Nuvho" width={125} height={44} priority />
        </Link>

        <div className="nv-auth__card">
          <h1 className="nv-auth__title">Sign In</h1>
          <p className="nv-auth__lede">Access the Nuvho Knowledge Base</p>

          <form onSubmit={handleSubmit} className="nv-auth__form">
            <div>
              <label className="nv-auth__label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="nv-auth__field"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="nv-auth__label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="nv-auth__field"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="nv-auth__error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="nv-auth__btn" aria-busy={loading || redirectingVia === 'password'}>
              {(loading || redirectingVia === 'password') && <span className="nv-spin nv-spin--sm nv-spin--w" aria-hidden="true" />}
              {loading || redirectingVia === 'password' ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="nv-auth__foot">
            Don&apos;t have an account? <Link href="/signup">Create one</Link>
          </p>
        </div>

        {microsoft && (
          <>
            <div className="nv-auth__divider"><span>Staff &amp; Admin</span></div>
            <MicrosoftSignInButton
              config={microsoft}
              disabled={busy}
              redirecting={redirectingVia === 'microsoft'}
              onBusyChange={setMicrosoftBusy}
              onError={setError}
              onSuccess={() => onSignedIn('microsoft')}
            />
          </>
        )}

        <p className="nv-auth__copy">&copy; Nuvho Systems Pty Ltd</p>
      </main>
    </div>
  )
}

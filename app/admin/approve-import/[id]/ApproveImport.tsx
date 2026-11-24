'use client'

import { useState } from 'react'
import type { GrantView } from '@/lib/importGrants'

type Phase = GrantView['status'] | 'ended'

export default function ApproveImport({ grant, email, hours }: { grant: GrantView; email: string; hours: number }) {
  const [phase, setPhase] = useState<Phase>(grant.status)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mine = !grant.email || grant.email.toLowerCase() === email.toLowerCase()

  async function decide(action: 'approve' | 'deny' | 'end') {
    setBusy(action)
    setError('')
    try {
      const res = await fetch(`/api/admin/import-grants/${grant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'That did not work. Try again.')
      else setPhase(action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'ended')
    } catch {
      setError('Could not reach the Knowledge Base. Try again.')
    }
    setBusy(null)
  }

  if (phase === 'pending') {
    return (
      <>
        <h1>Let Claude upload to the Knowledge Base?</h1>
        <p>
          Claude is asking to upload pages as <strong>{email}</strong>
          {grant.label ? <> from <strong>{grant.label}</strong></> : null}. Check that this code is the one Claude showed you:
        </p>
        <div className="na-approve__code" aria-label="Approval code">{grant.userCode}</div>
        <p>
          If you approve, Claude can add pages as <strong>pending</strong> articles for the next {hours} hours.
          It cannot publish, edit published articles or change anything else. Approve only if you started this save yourself.
        </p>
        {error && <p role="alert" style={{ color: 'var(--nv-danger, #b42318)' }}>{error}</p>}
        <div className="na-approve__actions">
          <button type="button" className="nv-btn" disabled={!!busy} aria-busy={busy === 'approve'} onClick={() => decide('approve')}>
            Approve
          </button>
          <button type="button" className="nv-btn nv-btn--secondary" disabled={!!busy} aria-busy={busy === 'deny'} onClick={() => decide('deny')}>
            Deny
          </button>
        </div>
      </>
    )
  }

  if (phase === 'approved') {
    return (
      <>
        <h1>Approved</h1>
        <p>
          Go back to Claude: the save continues by itself. Uploads arrive as pending articles in Admin → Articles.
          The approval ends {new Date(grant.status === 'approved' ? grant.expiresAt : Date.now() + hours * 3600_000).toLocaleString()}.
        </p>
        {error && <p role="alert" style={{ color: 'var(--nv-danger, #b42318)' }}>{error}</p>}
        {mine && (
          <div className="na-approve__actions">
            <button type="button" className="nv-btn nv-btn--secondary" disabled={!!busy} aria-busy={busy === 'end'} onClick={() => decide('end')}>
              End this approval now
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <h1>{phase === 'denied' ? 'Denied' : phase === 'ended' ? 'Approval ended' : 'This request has expired'}</h1>
      <p>
        {phase === 'denied'
          ? 'Claude cannot upload with this request. You can close this page.'
          : phase === 'ended'
            ? 'Claude can no longer upload with this approval. You can close this page.'
            : 'Start the save again in Claude to get a new approval link.'}
      </p>
    </>
  )
}

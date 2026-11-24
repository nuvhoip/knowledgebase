'use client'

import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/Icon'
import type { TokenInfo } from '@/lib/apiTokens'

// Admin → Claude tokens (decision 24 Nov 2026). Each staff member creates their own personal
// import token for the nuvho-knowledge-save skill: it lets Claude Code upload a page (with its
// drawings, images and videos) as a PENDING article, and nothing else. The token is shown
// once; only its hash is stored. Revoking takes effect immediately.

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function status(t: TokenInfo): { label: string; cls: string } {
  if (t.revokedAt) return { label: 'Revoked', cls: 'na-badge--neutral' }
  if (new Date(t.expiresAt) <= new Date()) return { label: 'Expired', cls: 'na-badge--neutral' }
  return { label: 'Active', cls: 'na-badge--good' }
}

export default function ImportTokensTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null)
  const [ready, setReady] = useState(true)
  const [name, setName] = useState('Claude Code')
  const [days, setDays] = useState(90)
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tokens')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReady(data.ready !== false)
      setTokens(data.tokens ?? [])
    } catch (err) {
      onToast(err instanceof Error && err.message ? err.message : 'Could not load your tokens.', 'error')
      setTokens([])
    }
  }, [onToast])

  useEffect(() => { load() }, [load])

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, days }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Could not create the token.', 'error'); return }
      setSecret(data.token)
      setCopied(false)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    setConfirmRevoke(null)
    try {
      const res = await fetch(`/api/admin/tokens/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Could not revoke the token.', 'error'); return }
      onToast('Token revoked. Claude can no longer use it.', 'success')
      await load()
    } catch {
      onToast('Network error.', 'error')
    }
  }

  async function copy() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      onToast('Copy failed: select the token and copy it by hand.', 'error')
    }
  }

  if (!ready) {
    return <p className="na-notice">Claude import tokens need database migration <strong>011_article_imports.sql</strong>. Ask an admin to run it.</p>
  }

  return (
    <div>
      <p className="na-help" style={{ maxWidth: 760 }}>
        A personal token lets the <strong>nuvho-knowledge-save</strong> skill in Claude Code send a page to the Knowledge Base
        with its drawings, images and videos. Articles it sends are always <strong>Pending</strong> until an admin publishes them,
        and are submitted in your name. The token can do nothing else. Treat it like a password.
      </p>

      <div className="na-token-new">
        <div className="na-field">
          <label className="na-label" htmlFor="token-name">Name</label>
          <input id="token-name" className="na-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Claude Code, work laptop" />
        </div>
        <div className="na-field na-field--sm">
          <label className="na-label" htmlFor="token-days">Expires after</label>
          <select id="token-days" className="na-select" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </div>
        <button type="button" className="nv-btn" disabled={creating || !name.trim()} onClick={create}>
          {creating ? <span className="nv-spin nv-spin--sm nv-spin--w" /> : <Icon name="plus" size={16} onDark />}
          Create token
        </button>
      </div>

      {secret && (
        <div className="na-card" style={{ padding: 20, marginBottom: 24 }}>
          <strong>Your new token. Copy it now: it will not be shown again.</strong>
          <div className="na-token-secret">
            <code>{secret}</code>
            <button type="button" className="nv-btn nv-btn--secondary nv-btn--sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="na-token-howto">
            <p>Set it once where Claude Code runs, then restart Claude Code. On Windows (PowerShell):</p>
            <pre>{`setx NUVHO_KB_TOKEN "${secret}"`}</pre>
            <p>On macOS or Linux, add to your shell profile:</p>
            <pre>{`export NUVHO_KB_TOKEN="${secret}"`}</pre>
          </div>
          <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={() => setSecret(null)}>I have saved it</button>
        </div>
      )}

      {tokens === null ? (
        <p className="na-history__muted"><span className="nv-spin nv-spin--sm" aria-hidden="true" /> Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="na-empty">You have no tokens yet.</p>
      ) : (
        <div className="na-card na-card--table">
          <table className="na-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Last used</th>
                <th>Status</th>
                <th className="na-table__r" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => {
                const st = status(t)
                return (
                  <tr key={t.id} className="na-row">
                    <td>{t.name}</td>
                    <td><code>{t.prefix}…</code></td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{formatDate(t.expiresAt)}</td>
                    <td>{formatDate(t.lastUsedAt)}</td>
                    <td><span className={`na-badge ${st.cls}`}>{st.label}</span></td>
                    <td className="na-table__r">
                      {st.label === 'Active' && (confirmRevoke === t.id ? (
                        <div className="na-actions">
                          <button type="button" className="nv-btn nv-btn--ghost nv-btn--danger nv-btn--sm" onClick={() => revoke(t.id)}>Revoke now</button>
                          <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={() => setConfirmRevoke(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="nv-btn nv-btn--ghost nv-btn--danger nv-btn--sm" onClick={() => setConfirmRevoke(t.id)}>Revoke</button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

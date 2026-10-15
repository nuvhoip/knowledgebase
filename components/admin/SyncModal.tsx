'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'

// Sync-to-vector-DB modal, shared by the admin Articles table and the article edit page.
// Posts to /api/admin/sync/[categorySlug]/[slug], which embeds the article as last saved.

export type SyncTier = 'domain' | 'internal' | 'client' | 'confidential'

export interface SyncTarget {
  categorySlug: string
  slug: string
  title: string
}

// ─── Tier config ──────────────────────────────────────────────────────────────
// Badge variants map to the §8 status law: good / info / warning / critical.

export const TIERS: { value: SyncTier; label: string; description: string; badge: string }[] = [
  { value: 'domain',       label: 'Domain',       description: 'Public-facing knowledge for all Nuvho clients', badge: 'na-badge--good' },
  { value: 'internal',     label: 'Internal',     description: 'Nuvho staff only — internal operations',        badge: 'na-badge--info' },
  { value: 'client',       label: 'Client',       description: 'Shared with specific hotel clients',            badge: 'na-badge--warn' },
  { value: 'confidential', label: 'Confidential', description: 'Restricted — executive or sensitive data',      badge: 'na-badge--crit' },
]

// ─── Sync Modal (§9: 520) ─────────────────────────────────────────────────────

export default function SyncModal({ target, onClose, note }: {
  target: SyncTarget
  onClose: (synced?: boolean) => void
  /** Optional extra line under the intro, e.g. the edit page's "last saved version" reminder. */
  note?: string
}) {
  const [tier, setTier] = useState<SyncTier>('domain')
  const [hgid, setHgid] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSync() {
    if (tier === 'client' && !hgid.trim()) {
      setError('Hotel Group ID (hgid) is required for the Client tier.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body: Record<string, string> = { tier }
      if (tier === 'client') body.hgid = hgid.trim()
      const res = await fetch(`/api/admin/sync/${target.categorySlug}/${target.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Sync failed.'); return }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="na-overlay" role="dialog" aria-modal="true" aria-labelledby="sync-title">
      <div className="na-modal">
        {done ? (
          <>
            <div className="na-modal__body">
              <div className="na-modal__centre">
                <div className="na-modal__icon na-modal__icon--good"><Icon name="circle-check" size={20} /></div>
                <h3 id="sync-title">Synced successfully</h3>
                <p>
                  <strong>{target.title}</strong> has been synced to the <strong>{TIERS.find(t => t.value === tier)?.label}</strong> tier.
                </p>
              </div>
            </div>
            <div className="na-modal__foot">
              <button type="button" onClick={() => onClose(true)} className="nv-btn">Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="na-modal__head">
              <div>
                <h3 id="sync-title" className="na-modal__title">Sync to Vector DB</h3>
                <p className="na-modal__sub">{target.title}</p>
              </div>
              <button type="button" onClick={() => onClose()} className="na-modal__close" aria-label="Close">
                <Icon name="xmark" size={14} />
              </button>
            </div>

            <div className="na-modal__body">
              <p>Select the access tier for this article&apos;s embeddings.</p>
              {note && <p className="na-notice">{note}</p>}

              <div className="na-form" style={{ gap: 8 }}>
                {TIERS.map(t => (
                  <label key={t.value} className={`na-tier${tier === t.value ? ' na-tier--active' : ''}`}>
                    <input
                      type="radio"
                      name="tier"
                      value={t.value}
                      checked={tier === t.value}
                      onChange={() => setTier(t.value)}
                    />
                    <div>
                      <strong>{t.label}</strong>
                      <span>{t.description}</span>
                    </div>
                    <span className={`na-badge ${t.badge}`}>{t.label}</span>
                  </label>
                ))}
              </div>

              {tier === 'client' && (
                <div className="na-field">
                  <label className="na-label" htmlFor="hgid">Hotel Group ID <span className="na-req">*</span></label>
                  <input
                    id="hgid"
                    type="text"
                    value={hgid}
                    onChange={e => setHgid(e.target.value)}
                    placeholder="e.g. hg-001"
                    className="na-input"
                  />
                  <span className="na-help">Required for client-tier embeddings — identifies which hotel group can access this content.</span>
                </div>
              )}

              {error && <p className="na-error" role="alert">{error}</p>}
            </div>

            <div className="na-modal__foot">
              <button type="button" onClick={() => onClose()} className="nv-btn nv-btn--secondary" disabled={loading}>Cancel</button>
              <button type="button" onClick={handleSync} disabled={loading} className="nv-btn">
                {loading ? <span className="nv-spin nv-spin--sm nv-spin--w" /> : <Icon name="arrows-rotate" size={16} />}
                {loading ? 'Syncing…' : 'Confirm sync'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/Icon'
import { diffLines, htmlToLines, type DiffOp } from '@/lib/diff'
import type { ArticleVersion, VersionSource, VersionSummary } from '@/lib/versions'

// Version history panel for the article editor (Pass 4, behind KB_VERSIONING_ENABLED — the
// edit page only renders it when the flag is on). Lists versions, shows any version
// read-only with an inline diff against the current one, and restores with confirmation.

const SOURCE_LABELS: Record<VersionSource, string> = {
  backfill: 'History started',
  baseline: 'Before first tracked change',
  editor: 'Edited',
  create: 'Created',
  ingest: 'Ingested',
  status: 'Status changed',
  restore: 'Restored',
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface Props {
  categorySlug: string
  slug: string
}

export default function VersionHistory({ categorySlug, slug }: Props) {
  const base = `/api/admin/articles/${categorySlug}/${slug}/versions`
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<{ version: ArticleVersion; current: ArticleVersion } | null>(null)
  const [detailError, setDetailError] = useState('')
  const [view, setView] = useState<'changes' | 'content'>('changes')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(base)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load version history.')
      setVersions(data.versions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version history.')
    }
  }, [base])

  useEffect(() => { load() }, [load])

  const latest = versions?.[0]?.versionNumber ?? null

  async function open(n: number) {
    setSelected(n)
    setDetail(null)
    setDetailError('')
    setView('changes')
    try {
      const fetchOne = async (v: number) => {
        const res = await fetch(`${base}/${v}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load this version.')
        return data.version as ArticleVersion
      }
      const [version, current] = await Promise.all([fetchOne(n), fetchOne(latest ?? n)])
      setDetail({ version, current })
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load this version.')
    }
  }

  async function restore(n: number) {
    setRestoring(true)
    setRestoreError('')
    try {
      const res = await fetch(`${base}/${n}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Restore failed. Nothing was changed.')
      // The edit form above holds the old content in state; reload so it shows the restore.
      window.location.reload()
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed. Nothing was changed.')
      setRestoring(false)
    }
  }

  const diff: DiffOp[] | null | undefined = useMemo(() => {
    if (!detail) return undefined
    return diffLines(htmlToLines(detail.version.content), htmlToLines(detail.current.content))
  }, [detail])

  return (
    <section className="na-history" aria-labelledby="history-title">
      <div className="na-history__head">
        <h2 id="history-title" className="na-form__title">Version history</h2>
        <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={load}>
          <Icon name="arrows-rotate" size={14} />
          Refresh
        </button>
      </div>

      {error && <p className="na-error" role="alert">{error}</p>}
      {!versions && !error && (
        <p className="na-history__muted"><span className="nv-spin nv-spin--sm" aria-hidden="true" /> Loading history…</p>
      )}
      {versions?.length === 0 && (
        <p className="na-history__muted">No versions yet. The first save creates one.</p>
      )}

      {versions && versions.length > 0 && (
        <ol className="na-history__list">
          {versions.map(v => {
            const isCurrent = v.versionNumber === latest
            return (
              <li key={v.versionNumber} className={`na-history__item${selected === v.versionNumber ? ' na-history__item--open' : ''}`}>
                <div className="na-history__row">
                  <span className="na-badge na-badge--neutral">v{v.versionNumber}</span>
                  <div className="na-history__meta">
                    <strong>
                      {SOURCE_LABELS[v.source] ?? v.source}
                      {v.restoredFrom ? ` (from v${v.restoredFrom})` : ''}
                      {isCurrent && <span className="na-badge na-badge--good">Current</span>}
                    </strong>
                    <span>
                      {formatWhen(v.changedAt)} · {v.changedBy ?? 'System'}
                      {v.changeSummary && v.source !== 'restore' ? ` · ${v.changeSummary}` : ''}
                    </span>
                  </div>
                  <div className="na-actions">
                    <button
                      type="button"
                      className="nv-btn nv-btn--ghost nv-btn--sm"
                      aria-expanded={selected === v.versionNumber}
                      onClick={() => (selected === v.versionNumber ? setSelected(null) : open(v.versionNumber))}
                    >
                      <Icon name="eye" size={14} />
                      {selected === v.versionNumber ? 'Hide' : 'View'}
                    </button>
                    {!isCurrent && (
                      <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={() => setConfirm(v.versionNumber)}>
                        <Icon name="clock" size={14} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>

                {selected === v.versionNumber && (
                  <div className="na-history__detail">
                    {detailError && <p className="na-error" role="alert">{detailError}</p>}
                    {!detail && !detailError && <p className="na-history__muted"><span className="nv-spin nv-spin--sm" aria-hidden="true" /> Loading…</p>}
                    {detail && (
                      <>
                        <div className="na-history__tabs" role="tablist" aria-label={`Version ${v.versionNumber}`}>
                          <button type="button" role="tab" aria-selected={view === 'changes'} className={`na-tab${view === 'changes' ? ' na-tab--active' : ''}`} onClick={() => setView('changes')}>
                            {isCurrent ? 'Content' : `Changes since v${v.versionNumber}`}
                          </button>
                          {!isCurrent && (
                            <button type="button" role="tab" aria-selected={view === 'content'} className={`na-tab${view === 'content' ? ' na-tab--active' : ''}`} onClick={() => setView('content')}>
                              v{v.versionNumber} as it was
                            </button>
                          )}
                        </div>

                        {view === 'changes' && !isCurrent ? (
                          <div className="na-diff">
                            {detail.version.title !== detail.current.title && (
                              <p className="na-diff__field"><strong>Title</strong> <del>{detail.version.title}</del> <ins>{detail.current.title}</ins></p>
                            )}
                            {detail.version.description !== detail.current.description && (
                              <p className="na-diff__field"><strong>Description</strong> <del>{detail.version.description}</del> <ins>{detail.current.description}</ins></p>
                            )}
                            {diff === null && <p className="na-history__muted">This article is too long to compare line by line. Use “v{v.versionNumber} as it was” instead.</p>}
                            {diff && diff.every(op => op.type === 'same') && detail.version.title === detail.current.title && detail.version.description === detail.current.description && (
                              <p className="na-history__muted">No text changes between v{v.versionNumber} and the current version (status, category or visibility may differ).</p>
                            )}
                            {diff && diff.some(op => op.type !== 'same') && (
                              <ul className="na-diff__lines" aria-label="Line changes: removed lines are struck through, added lines are underlined">
                                {diff.map((op, i) => (
                                  <li key={i} className={`na-diff__line na-diff__line--${op.type}`}>
                                    <span aria-hidden="true">{op.type === 'add' ? '+' : op.type === 'del' ? '−' : ' '}</span>
                                    {op.type === 'add' ? <ins>{op.text}</ins> : op.type === 'del' ? <del>{op.text}</del> : op.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : (
                          <div className="na-history__preview">
                            <h3>{detail.version.title}</h3>
                            <p className="na-history__muted">{detail.version.description}</p>
                            {/* Stored article HTML, rendered exactly as the article page renders it */}
                            <div className="nw-prose" dangerouslySetInnerHTML={{ __html: detail.version.content ?? '' }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {confirm !== null && (
        <div className="na-overlay" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <div className="na-modal na-modal--confirm">
            <div className="na-modal__head">
              <h3 id="restore-title" className="na-modal__title">Restore version {confirm}?</h3>
              <button type="button" onClick={() => setConfirm(null)} className="na-modal__close" aria-label="Close" disabled={restoring}>
                <Icon name="xmark" size={14} />
              </button>
            </div>
            <div className="na-modal__body">
              <div className="na-modal__icon"><Icon name="triangle-exclamation" size={20} /></div>
              <p>
                The title, description, body and read time from v{confirm} become a new version
                (v{(latest ?? 0) + 1}). Newer versions are kept, and status, category and visibility stay as they are.
                Unsaved edits in the form above will be lost. Sync the article again afterwards to update the vector DB.
              </p>
              {restoreError && <p className="na-error" role="alert">{restoreError}</p>}
            </div>
            <div className="na-modal__foot">
              <button type="button" onClick={() => setConfirm(null)} className="nv-btn nv-btn--secondary" disabled={restoring}>Cancel</button>
              <button type="button" onClick={() => restore(confirm)} className="nv-btn" disabled={restoring}>
                {restoring ? <span className="nv-spin nv-spin--sm nv-spin--w" /> : <Icon name="clock" size={16} />}
                {restoring ? 'Restoring…' : `Restore v${confirm}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

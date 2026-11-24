'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/Icon'
import { ACCEPTED_ASSET_TYPES, uploadTo } from '@/lib/uploadClient'
import { videoHtml } from '@/lib/embeds'
import type { EditorHandle } from '@/components/editor/TinyEditor'
import type { ArticleAsset, ArticleImportInfo } from '@/lib/importDb'

// The editor's Assets panel (decision 24 Nov 2026, NUVCL-201: "some component to manage or
// re-inject imported assets"). Per article, never the shared image library. Lists every
// drawing, image and video the article's imports brought, shows whether each is still in the
// text, and lets the author put one back at the cursor, replace its file (everywhere it is
// used) or open it. "Restore imported version" loads the body exactly as the last import
// made it (with replacements); nothing is saved until the author saves.

interface Props {
  categorySlug: string
  slug: string
  editor: EditorHandle | null
  /** Current body HTML, to show which assets are still used. */
  content: string
  /** Bumps after a save so a newly attached import shows up. */
  refreshKey?: number
  /** An import made in this session but not saved yet: shown as a note. */
  unsavedImport?: boolean
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const KIND_LABEL: Record<ArticleAsset['kind'], string> = { svg: 'Drawing (SVG)', image: 'Image', video: 'Video' }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The markup that puts an asset back where the cursor is. */
function markupFor(a: ArticleAsset): string {
  if (!a.url) return ''
  if (a.kind === 'video') return videoHtml(a.url)
  if (a.role === 'icon') return `<img class="nw-icon" src="${esc(a.url)}" alt="">`
  const size = a.width && a.height ? ` width="${a.width}" height="${a.height}"` : ''
  const img = `<img src="${esc(a.url)}" alt="${esc(a.alt)}"${size}>`
  return a.role === 'inline' ? img : `<figure class="nw-figure">${img}</figure>`
}

export default function ArticleAssets({ categorySlug, slug, editor, content, refreshKey = 0, unsavedImport = false }: Props) {
  const base = `/api/admin/articles/${categorySlug}/${slug}/imports`
  const [data, setData] = useState<{ ready: boolean; imports: ArticleImportInfo[]; assets: ArticleAsset[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const replacing = useRef<ArticleAsset | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(base)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the assets.')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the assets.')
    }
  }, [base])

  useEffect(() => { load() }, [load, refreshKey])

  if (data && !data.ready) return null // migration 011 not run yet: the feature stays hidden
  const latest = data?.imports[0]
  const assets = data ? data.assets.filter(a => latest && a.importId === latest.id) : []
  const older = data ? data.assets.filter(a => !latest || a.importId !== latest.id) : []
  if (data && !latest && !unsavedImport) return null // never imported: nothing to show

  async function restore() {
    if (!latest || !editor) return
    setBusy('restore')
    setMessage('')
    try {
      const res = await fetch(`${base}/${latest.id}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the imported version.')
      editor.replaceAll(body.html)
      setMessage('The imported version is in the editor. Save to keep it, or Undo to go back.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setBusy(null)
      setConfirmRestore(false)
    }
  }

  function pickReplacement(a: ArticleAsset) {
    replacing.current = a
    fileInput.current?.click()
  }

  async function replaceWith(file: File) {
    const a = replacing.current
    if (!a) return
    setBusy(`${a.importId}:${a.position}`)
    setMessage('')
    setError('')
    try {
      const r = await uploadTo(`${base}/${a.importId}/assets/${a.position}`, file, file.name) as unknown as { url: string; oldUrl: string | null }
      if (r.oldUrl && editor) editor.replaceUrl(r.oldUrl, r.url)
      setMessage(r.oldUrl && content.includes(r.oldUrl)
        ? 'Replaced everywhere it is used. Save to keep the change.'
        : 'Replaced. Use Insert to put it in the article.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed.')
    } finally {
      setBusy(null)
      replacing.current = null
    }
  }

  function row(a: ArticleAsset) {
    const used = !!a.url && content.includes(a.url)
    const key = `${a.importId}:${a.position}`
    return (
      <li key={key} className="na-assets__item">
        <div className="na-assets__thumb" aria-hidden="true">
          {a.url && a.kind !== 'video'
            ? <img src={a.url} alt="" loading="lazy" />
            : <Icon name={a.kind === 'video' ? 'circle-play' : 'triangle-exclamation'} size={20} />}
        </div>
        <div className="na-assets__meta">
          <strong title={a.sourceRef}>{a.sourceRef}</strong>
          <span>
            {KIND_LABEL[a.kind]}{a.role === 'icon' ? ' · icon' : ''}
            {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
            {a.replacedAt ? ` · replaced ${formatWhen(a.replacedAt)}` : ''}
          </span>
          {a.error
            ? <span className="na-assets__error">Not stored: {a.error}</span>
            : <span className={used ? 'na-badge na-badge--good' : 'na-badge na-badge--neutral'}>{used ? 'In the article' : 'Not in the article'}</span>}
        </div>
        <div className="na-actions">
          {a.url && (
            <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" disabled={!editor || !!busy}
              onClick={() => { editor?.insertHtml(markupFor(a)); setMessage('Inserted at the cursor. Save to keep it.') }}>
              <Icon name="plus" size={14} /> Insert
            </button>
          )}
          <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" disabled={!!busy} onClick={() => pickReplacement(a)}>
            {busy === key ? <span className="nv-spin nv-spin--sm" aria-hidden="true" /> : <Icon name="cloud-arrow-up" size={14} />}
            {a.url ? 'Replace' : 'Upload'}
          </button>
          {a.url && (
            <a className="nv-btn nv-btn--ghost nv-btn--sm" href={a.url} target="_blank" rel="noopener noreferrer">
              <Icon name="eye" size={14} /> Open
            </a>
          )}
        </div>
      </li>
    )
  }

  return (
    <section className="na-assets" aria-labelledby="assets-title">
      <div className="na-history__head">
        <h2 id="assets-title" className="na-form__title">Assets</h2>
        <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={load}>
          <Icon name="arrows-rotate" size={14} /> Refresh
        </button>
      </div>

      {unsavedImport && (
        <p className="na-notice">You imported a page in this session. Its assets are listed here once you save.</p>
      )}

      {latest && (
        <div className="na-assets__import">
          <div className="na-history__meta">
            <strong><Icon name="file-lines" size={14} /> Imported from {latest.sourceName}</strong>
            <span>
              {formatWhen(latest.createdAt)} by {latest.createdBy}
              {latest.via === 'claude' ? ' (from Claude)' : ''} · {latest.importerVersion}
            </span>
            {latest.notes.length > 0 && (
              <button type="button" className="na-linkbtn" onClick={() => setShowNotes(s => !s)}>
                {showNotes ? 'Hide import notes' : `Import notes (${latest.notes.length})`}
              </button>
            )}
            {showNotes && <ul className="na-assets__notes">{latest.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          </div>
          <div className="na-actions">
            {!confirmRestore ? (
              <button type="button" className="nv-btn nv-btn--secondary nv-btn--sm" disabled={!editor || !!busy} onClick={() => setConfirmRestore(true)}>
                <Icon name="arrows-rotate" size={14} /> Restore imported version
              </button>
            ) : (
              <>
                <span className="na-history__muted">Replace the text with the imported version?</span>
                <button type="button" className="nv-btn nv-btn--sm" disabled={busy === 'restore'} onClick={restore}>
                  {busy === 'restore' && <span className="nv-spin nv-spin--sm nv-spin--w" />} Restore
                </button>
                <button type="button" className="nv-btn nv-btn--ghost nv-btn--sm" onClick={() => setConfirmRestore(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p className="na-error" role="alert">{error}</p>}
      {message && <p className="na-history__muted" role="status">{message}</p>}
      {!data && !error && <p className="na-history__muted"><span className="nv-spin nv-spin--sm" aria-hidden="true" /> Loading assets…</p>}

      {latest && assets.length === 0 && <p className="na-history__muted">The last import brought no images, drawings or videos.</p>}
      {assets.length > 0 && <ul className="na-assets__list">{assets.map(row)}</ul>}

      {older.length > 0 && (
        <details className="na-assets__older">
          <summary>Assets from earlier imports ({older.length})</summary>
          <ul className="na-assets__list">{older.map(row)}</ul>
        </details>
      )}

      <input
        ref={fileInput} type="file" accept={ACCEPTED_ASSET_TYPES} hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) replaceWith(f) }}
      />
      <p className="na-help">
        Replacing keeps the same place in the article. SVG drawings are cleaned and get the brand fonts; images up to 10 MB, MP4 video up to 100 MB.
      </p>
    </section>
  )
}

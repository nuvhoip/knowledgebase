'use client'

import { Fragment, useState, useEffect, useCallback, useRef } from 'react'
import Icon from '@/components/Icon'
import { extractHero, injectHero } from '@/components/heroImage'
import RichTextEditor from '@/components/RichTextEditor'
import ImageUploadField from '@/components/ImageUploadField'

// Admin dashboard — browser-app law (nuvho-web-design references/browser-app-shell.md):
// §4 Figma Button · §5 Figma field · §6 table (48px rows, sentence-case header)
// §8 badge status mapping · §9 modal 520 / 440 confirm. All data handling is unchanged;
// only the markup and classes were rebuilt.

// ─── Types ────────────────────────────────────────────────────────────────────

type VisibilityValue = 'public' | 'private'

// 10 common icons from the Nuvho brand icon set (public/icons/) offered when picking a
// category icon, covering the categories already seeded plus a few general-purpose ones.
const CATEGORY_ICONS = [
  'rocket.svg',
  'booking-engine.svg',
  'gears.svg',
  'chart-line-up.svg',
  'file-chart-pie.svg',
  'credit-card-front.svg',
  'sitemap.svg',
  'head-side-headphones.svg',
  'hotel.svg',
  'comments.svg',
] as const

interface AdminCategory {
  slug: string
  title: string
  description: string
  icon: string
  article_count: number
  sort_order: number
  visibility: VisibilityValue
}

interface AdminSubcategory {
  slug: string
  title: string
  description: string
  category_slug: string
  category_title?: string
  sort_order: number
  article_count: number
  visibility: VisibilityValue | null
}

interface AdminArticle {
  slug: string
  title: string
  description: string
  category_slug: string
  category_title: string
  subcategory_slug: string
  subcategory_title: string
  read_time: number
  featured: boolean
  sort_order: number
  updated_at: string
  status: 'pending' | 'published'
  vector_tier?: string | null
  vector_synced_at?: string | null
  visibility: VisibilityValue | null
  category_visibility: VisibilityValue
  subcategory_visibility: VisibilityValue | null
}

/** article.visibility ?? subcategory.visibility ?? category.visibility */
function effectiveVisibility(a: Pick<AdminArticle, 'visibility' | 'subcategory_visibility' | 'category_visibility'>): VisibilityValue {
  return a.visibility ?? a.subcategory_visibility ?? a.category_visibility ?? 'public'
}

type SyncTier = 'domain' | 'internal' | 'client' | 'confidential'

interface SyncTarget {
  categorySlug: string
  slug: string
  title: string
}

// ─── Tier config ──────────────────────────────────────────────────────────────
// Badge variants map to the §8 status law: good / info / warning / critical.

const TIERS: { value: SyncTier; label: string; description: string; badge: string }[] = [
  { value: 'domain',       label: 'Domain',       description: 'Public-facing knowledge for all Nuvho clients', badge: 'na-badge--good' },
  { value: 'internal',     label: 'Internal',     description: 'Nuvho staff only — internal operations',        badge: 'na-badge--info' },
  { value: 'client',       label: 'Client',       description: 'Shared with specific hotel clients',            badge: 'na-badge--warn' },
  { value: 'confidential', label: 'Confidential', description: 'Restricted — executive or sensitive data',      badge: 'na-badge--crit' },
]

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`na-toast${type === 'error' ? ' na-toast--error' : ''}`} role="status" aria-live="polite">
      <Icon name={type === 'success' ? 'circle-check' : 'circle-xmark'} size={16} />
      <span>{message}</span>
      <button type="button" onClick={onClose} className="na-toast__close" aria-label="Dismiss">
        <Icon name="xmark" size={12} />
      </button>
    </div>
  )
}

// ─── Confirm dialog (§9: 440 confirm) ─────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="na-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="na-modal na-modal--confirm">
        <div className="na-modal__head">
          <h3 id="confirm-title" className="na-modal__title">Confirm delete</h3>
          <button type="button" onClick={onCancel} className="na-modal__close" aria-label="Close">
            <Icon name="xmark" size={14} />
          </button>
        </div>
        <div className="na-modal__body">
          <div className="na-modal__icon"><Icon name="triangle-exclamation" size={20} /></div>
          <p>{message}</p>
        </div>
        <div className="na-modal__foot">
          <button type="button" onClick={onCancel} className="nv-btn nv-btn--secondary">Cancel</button>
          <button type="button" onClick={onConfirm} className="nv-btn nv-btn--danger">
            <Icon name="trash-can" size={16} />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sync Modal (§9: 520) ─────────────────────────────────────────────────────

function SyncModal({ target, onClose }: { target: SyncTarget; onClose: (synced?: boolean) => void }) {
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

// ─── Icon picker ──────────────────────────────────────────────────────────────
// Visual picker offering 10 common category icons. Selecting a swatch sets the same
// plain-string icon value (e.g. "rocket.svg") that CategoryForm already stores via setIcon.

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="na-iconpick" role="radiogroup" aria-label="Category icon">
      {CATEGORY_ICONS.map(iconFile => {
        const selected = value === iconFile
        return (
          <button
            key={iconFile}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(iconFile)}
            title={iconFile}
            className={selected ? 'na-iconpick--active' : undefined}
          >
            <Icon name={iconFile} size={20} alt={iconFile.replace('.svg', '')} />
          </button>
        )
      })}
    </div>
  )
}

// ─── Category form ────────────────────────────────────────────────────────────

function CategoryForm({ title, desc, icon, visibility, setTitle, setDesc, setIcon, setVisibility, onSave, onCancel, saving, saveLabel }: {
  title: string; desc: string; icon: string; visibility: VisibilityValue
  setTitle: (v: string) => void; setDesc: (v: string) => void; setIcon: (v: string) => void
  setVisibility: (v: VisibilityValue) => void
  onSave: () => void; onCancel: () => void; saving: boolean; saveLabel: string
}) {
  return (
    <div className="na-form">
      <div className="na-grid-2">
        <div className="na-field">
          <label className="na-label">Title <span className="na-req">*</span></label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Booking & Reservations"
            className="na-input"
          />
        </div>
        <div className="na-field">
          <label className="na-label">Visibility</label>
          <select
            value={visibility}
            onChange={e => setVisibility(e.target.value as VisibilityValue)}
            className="na-select"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
      <div className="na-field">
        <label className="na-label">Icon</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="na-field">
        <label className="na-label">Description <span className="na-req">*</span></label>
        <textarea
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Short description of this category…"
          className="na-textarea"
        />
      </div>
      <p className="na-help">
        <strong>Public</strong> — visible to everyone on knowledge.nuvho.com.{' '}
        <strong>Private</strong> — visitors must log in to view articles in this category (unless a sub-category or article overrides it).
      </p>
      <div className="na-form__actions">
        <button type="button" onClick={onCancel} className="nv-btn nv-btn--secondary" disabled={saving}>Cancel</button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !title.trim() || !desc.trim()}
          className="nv-btn"
        >
          {saving && <span className="nv-spin nv-spin--sm nv-spin--w" />}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Article form ─────────────────────────────────────────────────────────────

function ArticleForm({ categories, subcategories, title, desc, category, subcategory, content, readTime, featured, visibility,
  setTitle, setDesc, setCategory, setSubcategory, setContent, setReadTime, setFeatured, setVisibility,
  onSave, onCancel, saving, saveLabel, showCategory, hero = '', setHero, showHero = false }: {
  categories: AdminCategory[]
  subcategories: AdminSubcategory[]
  title: string; desc: string; category: string; subcategory: string; content: string; readTime: string; featured: boolean
  visibility: VisibilityValue | ''
  setTitle: (v: string) => void; setDesc: (v: string) => void; setCategory: (v: string) => void
  setSubcategory: (v: string) => void
  setContent: (v: string) => void; setReadTime: (v: string) => void; setFeatured: (v: boolean) => void
  setVisibility: (v: VisibilityValue | '') => void
  onSave: () => void; onCancel: () => void; saving: boolean; saveLabel: string; showCategory: boolean
  /** Hero image URL (stored at the top of the article HTML — components/heroImage.ts).
   *  Shown on create and, once startEdit has loaded the stored HTML, on inline edit too. */
  hero?: string; setHero?: (v: string) => void; showHero?: boolean
}) {
  const subsForCategory = subcategories.filter(s => s.category_slug === category)
  return (
    <div className="na-form">
      <div className="na-grid-2">
        <div className="na-field">
          <label className="na-label">Title <span className="na-req">*</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Article title" className="na-input" />
        </div>
        {showCategory && (
          <div className="na-field">
            <label className="na-label">Category <span className="na-req">*</span></label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="na-select">
              {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="na-grid-2">
        <div className="na-field">
          <label className="na-label">Sub-category <span className="na-req">*</span></label>
          <select value={subcategory} onChange={e => setSubcategory(e.target.value)}
            disabled={subsForCategory.length === 0}
            className="na-select">
            {subsForCategory.length === 0 && <option value="">No sub-categories in this category</option>}
            {subsForCategory.map(s => <option key={s.slug} value={s.slug}>{s.title}</option>)}
          </select>
        </div>
        <div className="na-field">
          <label className="na-label">Visibility</label>
          <VisibilitySelect value={visibility} onChange={setVisibility} inheritLabel="Inherit from category/sub-category" />
        </div>
      </div>
      <div className="na-field">
        <label className="na-label">Description <span className="na-req">*</span></label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description…" className="na-textarea" />
      </div>
      {showHero && setHero && (
        <div className="na-field">
          <label className="na-label" htmlFor="heroSrc">Hero image <small>optional</small></label>
          <ImageUploadField
            id="heroSrc"
            value={hero}
            onChange={setHero}
            disabled={saving}
            help="Full-width behind the title and on tiles. Upload a JPG, PNG, WebP or GIF up to 10 MB, or paste a URL. Stored as the first element of the article HTML."
          />
        </div>
      )}
      <div className="na-field">
        <label className="na-label">Content</label>
        <RichTextEditor value={content} onChange={setContent} disabled={saving} minHeight={320} />
        <span className="na-help">
          Drag, paste or insert images straight into the text and they upload automatically.
          The <strong>&lt;&gt;</strong> button opens the raw HTML.
        </span>
      </div>
      <div className="na-row-inline">
        <div className="na-field na-field--sm">
          <label className="na-label">Read time (min)</label>
          <input type="number" min={1} max={60} value={readTime} onChange={e => setReadTime(e.target.value)} className="na-input" />
        </div>
        <label className="na-check" style={{ height: 44 }}>
          <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />
          Featured article
        </label>
      </div>
      <div className="na-form__actions">
        <button type="button" onClick={onCancel} className="nv-btn nv-btn--secondary" disabled={saving}>Cancel</button>
        <button type="button" onClick={onSave} disabled={saving || !title.trim() || !desc.trim()} className="nv-btn">
          {saving && <span className="nv-spin nv-spin--sm nv-spin--w" />}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Status badge (§8: published → Semantic good · pending → Semantic warning) ──

function StatusBadge({ status }: { status: 'pending' | 'published' }) {
  return (
    <span className={`na-badge ${status === 'published' ? 'na-badge--good' : 'na-badge--warn'}`}>
      {status === 'published' ? 'Live' : 'Pending'}
    </span>
  )
}

// ─── Visibility badge + select ────────────────────────────────────────────────

function VisibilityBadge({ visibility, inherited }: { visibility: VisibilityValue; inherited?: boolean }) {
  return (
    <span className={`na-badge ${visibility === 'public' ? 'na-badge--neutral' : 'na-badge--crit'}`}>
      {visibility === 'private' && <Icon name="lock" size={12} />}
      {visibility === 'public' ? 'Public' : 'Private'}
      {inherited && <span className="na-badge__muted">(inherited)</span>}
    </span>
  )
}

/** Select for an optional visibility override. `value === ''` means "inherit". */
function VisibilitySelect({ value, onChange, inheritLabel = 'Inherit from parent' }: {
  value: VisibilityValue | ''
  onChange: (v: VisibilityValue | '') => void
  inheritLabel?: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as VisibilityValue | '')}
      className="na-select"
    >
      <option value="">{inheritLabel}</option>
      <option value="public">Public</option>
      <option value="private">Private</option>
    </select>
  )
}

function Loading() {
  return (
    <div className="na-loading" role="status" aria-live="polite">
      <span className="nv-spin" />
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminCategory | null>(null)
  const [saving, setSaving] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formIcon, setFormIcon] = useState('')
  const [formVisibility, setFormVisibility] = useState<VisibilityValue>('public')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/categories')
      const data = await res.json()
      setCategories(Array.isArray(data) ? data : [])
    } catch {
      onToast('Failed to load categories.', 'error')
    } finally {
      setLoading(false)
    }
  }, [onToast])

  useEffect(() => { load() }, [load])

  function startEdit(cat: AdminCategory) {
    setEditingSlug(cat.slug)
    setFormTitle(cat.title)
    setFormDesc(cat.description)
    setFormIcon(cat.icon || '')
    setFormVisibility(cat.visibility || 'public')
    setShowAdd(false)
  }

  function startAdd() {
    setShowAdd(true)
    setEditingSlug(null)
    setFormTitle('')
    setFormDesc('')
    setFormIcon('')
    setFormVisibility('public')
  }

  function cancel() {
    setEditingSlug(null)
    setShowAdd(false)
  }

  async function saveEdit() {
    if (!editingSlug) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/categories/${editingSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDesc, icon: formIcon, visibility: formVisibility }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Update failed.', 'error'); return }
      onToast('Category updated.', 'success')
      setEditingSlug(null)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdd() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDesc, icon: formIcon, visibility: formVisibility }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Create failed.', 'error'); return }
      onToast('Category created.', 'success')
      setShowAdd(false)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(cat: AdminCategory) {
    setConfirmDelete(null)
    try {
      const res = await fetch(`/api/admin/categories/${cat.slug}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Delete failed.', 'error'); return }
      onToast(`Category "${cat.title}" deleted.`, 'success')
      await load()
    } catch {
      onToast('Network error.', 'error')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="na-toolbar">
        <div className="na-toolbar__left">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        </div>
        {!showAdd && (
          <button type="button" onClick={startAdd} className="nv-btn">
            <Icon name="plus" size={16} />
            Add category
          </button>
        )}
      </div>

      {showAdd && (
        <div className="na-card na-card--form">
          <h4 className="na-form__title">New category</h4>
          <CategoryForm
            title={formTitle} desc={formDesc} icon={formIcon} visibility={formVisibility}
            setTitle={setFormTitle} setDesc={setFormDesc} setIcon={setFormIcon} setVisibility={setFormVisibility}
            onSave={saveAdd} onCancel={cancel} saving={saving} saveLabel="Create category"
          />
        </div>
      )}

      <div className="na-card na-card--table">
        <table className="na-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Icon</th>
              <th className="na-table__c">Visibility</th>
              <th className="na-table__c">Articles</th>
              <th className="na-table__r" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const isExpanded = expandedSlug === cat.slug
              return (
                <Fragment key={cat.slug}>
                  <tr className="na-row">
                    <td>
                      <button
                        type="button"
                        onClick={() => setExpandedSlug(isExpanded ? null : cat.slug)}
                        className={`na-expander${isExpanded ? ' na-expander--open' : ''}`}
                        aria-expanded={isExpanded}
                      >
                        <Icon name="angle-right" size={12} />
                        <span>
                          <span className="na-table__title">{cat.title}</span>
                          <p className="na-table__desc">{cat.description}</p>
                          <p className="na-table__slug">{cat.slug}</p>
                        </span>
                      </button>
                    </td>
                    <td>
                      {cat.icon
                        ? <Icon name={cat.icon} size={20} alt={cat.icon} />
                        : <span className="na-table__sub">—</span>}
                    </td>
                    <td className="na-table__c">
                      <VisibilityBadge visibility={cat.visibility || 'public'} />
                    </td>
                    <td className="na-table__c">
                      <span className="na-count">{cat.article_count}</span>
                    </td>
                    <td>
                      <div className="na-actions">
                        <button type="button" onClick={() => setExpandedSlug(isExpanded ? null : cat.slug)} className="nv-btn nv-btn--ghost nv-btn--sm">
                          <Icon name="layer-group" size={14} />
                          Sub-categories
                        </button>
                        <button type="button" onClick={() => startEdit(cat)} className="nv-btn nv-btn--ghost nv-btn--sm">
                          <Icon name="pen-to-square" size={14} />
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(cat)} className="nv-btn nv-btn--ghost nv-btn--danger nv-btn--sm">
                          <Icon name="trash-can" size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingSlug === cat.slug && (
                    <tr className="na-row--edit">
                      <td colSpan={5}>
                        <h4 className="na-form__title">Edit &ldquo;{cat.title}&rdquo;</h4>
                        <CategoryForm
                          title={formTitle} desc={formDesc} icon={formIcon} visibility={formVisibility}
                          setTitle={setFormTitle} setDesc={setFormDesc} setIcon={setFormIcon} setVisibility={setFormVisibility}
                          onSave={saveEdit} onCancel={cancel} saving={saving} saveLabel="Save changes"
                        />
                      </td>
                    </tr>
                  )}
                  {isExpanded && (
                    <tr className="na-row--panel">
                      <td colSpan={5}>
                        <CategorySubcategoriesPanel
                          categorySlug={cat.slug}
                          categoryVisibility={cat.visibility || 'public'}
                          onToast={onToast}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="na-empty">
                  No categories yet. Click &ldquo;Add category&rdquo; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.title}"? This will also delete all ${confirmDelete.article_count} article(s) in this category. This cannot be undone.`}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ─── Subcategory form ─────────────────────────────────────────────────────────

function SubcategoryForm({ categories, title, desc, categorySlug, visibility,
  setTitle, setDesc, setCategorySlug, setVisibility,
  onSave, onCancel, saving, saveLabel, showCategory }: {
  categories: AdminCategory[]
  title: string; desc: string; categorySlug: string; visibility: VisibilityValue | ''
  setTitle: (v: string) => void; setDesc: (v: string) => void
  setCategorySlug: (v: string) => void; setVisibility: (v: VisibilityValue | '') => void
  onSave: () => void; onCancel: () => void; saving: boolean; saveLabel: string; showCategory: boolean
}) {
  return (
    <div className="na-form">
      <div className={showCategory ? 'na-grid-3' : 'na-grid-2'}>
        <div className="na-field">
          <label className="na-label">Title <span className="na-req">*</span></label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Rate Plans" className="na-input" />
        </div>
        {showCategory && (
          <div className="na-field">
            <label className="na-label">Category <span className="na-req">*</span></label>
            <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} className="na-select">
              {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </div>
        )}
        <div className="na-field">
          <label className="na-label">Visibility</label>
          <VisibilitySelect value={visibility} onChange={setVisibility} inheritLabel="Inherit from category" />
        </div>
      </div>
      <div className="na-field">
        <label className="na-label">Description <span className="na-req">*</span></label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short description…" className="na-textarea" />
      </div>
      <div className="na-form__actions">
        <button type="button" onClick={onCancel} className="nv-btn nv-btn--secondary" disabled={saving}>Cancel</button>
        <button type="button" onClick={onSave} disabled={saving || !title.trim() || !desc.trim()} className="nv-btn">
          {saving && <span className="nv-spin nv-spin--sm nv-spin--w" />}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Subcategories panel ──────────────────────────────────────────────────────

/** Inline panel shown when a category row is expanded — manages that one category's
 *  sub-categories. Lives under Categories, not as its own top-level tab. */
function CategorySubcategoriesPanel({ categorySlug, categoryVisibility, onToast }: {
  categorySlug: string
  categoryVisibility: VisibilityValue
  onToast: (msg: string, type: 'success' | 'error') => void
}) {
  const [subcategories, setSubcategories] = useState<AdminSubcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminSubcategory | null>(null)
  const [saving, setSaving] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formVisibility, setFormVisibility] = useState<VisibilityValue | ''>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/subcategories?category=${encodeURIComponent(categorySlug)}`)
      const data = await res.json()
      setSubcategories(Array.isArray(data) ? data : [])
    } catch {
      onToast('Failed to load sub-categories.', 'error')
    } finally {
      setLoading(false)
    }
  }, [categorySlug, onToast])

  useEffect(() => { load() }, [load])

  function startEdit(sub: AdminSubcategory) {
    setEditingSlug(sub.slug)
    setFormTitle(sub.title)
    setFormDesc(sub.description)
    setFormVisibility(sub.visibility ?? '')
    setShowAdd(false)
  }

  function startAdd() {
    setShowAdd(true)
    setEditingSlug(null)
    setFormTitle('')
    setFormDesc('')
    setFormVisibility('')
  }

  function cancel() {
    setEditingSlug(null)
    setShowAdd(false)
  }

  async function saveEdit() {
    if (!editingSlug) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/subcategories/${editingSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDesc, visibility: formVisibility || null }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Update failed.', 'error'); return }
      onToast('Sub-category updated.', 'success')
      setEditingSlug(null)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdd() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/subcategories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle, description: formDesc, categorySlug,
          visibility: formVisibility || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Create failed.', 'error'); return }
      onToast('Sub-category created.', 'success')
      setShowAdd(false)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(sub: AdminSubcategory) {
    setConfirmDelete(null)
    try {
      const res = await fetch(`/api/admin/subcategories/${sub.slug}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Delete failed.', 'error'); return }
      onToast(`Sub-category "${sub.title}" deleted.`, 'success')
      await load()
    } catch {
      onToast('Network error.', 'error')
    }
  }

  return (
    <div className="na-subpanel">
      <div className="na-subpanel__head">
        <span>{subcategories.length} sub-{subcategories.length === 1 ? 'category' : 'categories'}</span>
        {!showAdd && (
          <button type="button" onClick={startAdd} className="nv-btn nv-btn--sm">
            <Icon name="plus" size={14} />
            Add sub-category
          </button>
        )}
      </div>

      {showAdd && (
        <div className="na-card na-card--form">
          <h4 className="na-form__title">New sub-category</h4>
          <SubcategoryForm
            categories={[]}
            title={formTitle} desc={formDesc} categorySlug={categorySlug} visibility={formVisibility}
            setTitle={setFormTitle} setDesc={setFormDesc} setCategorySlug={() => {}} setVisibility={setFormVisibility}
            onSave={saveAdd} onCancel={cancel} saving={saving} saveLabel="Create sub-category"
            showCategory={false}
          />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : subcategories.length === 0 ? (
        <p className="na-empty">No sub-categories yet. Click &ldquo;Add sub-category&rdquo; to create one.</p>
      ) : (
        <div className="na-card na-card--table">
          <table className="na-table">
            <thead>
              <tr>
                <th>Sub-category</th>
                <th className="na-table__c">Visibility</th>
                <th className="na-table__c">Articles</th>
                <th className="na-table__r" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {subcategories.map(sub => (
                <Fragment key={sub.slug}>
                  <tr className="na-row">
                    <td>
                      <span className="na-table__title">{sub.title}</span>
                      <p className="na-table__desc">{sub.description}</p>
                      <p className="na-table__slug">{sub.slug}</p>
                    </td>
                    <td className="na-table__c">
                      {sub.visibility
                        ? <VisibilityBadge visibility={sub.visibility} />
                        : <VisibilityBadge visibility={categoryVisibility} inherited />}
                    </td>
                    <td className="na-table__c">
                      <span className="na-count">{sub.article_count}</span>
                    </td>
                    <td>
                      <div className="na-actions">
                        <button type="button" onClick={() => startEdit(sub)} className="nv-btn nv-btn--ghost nv-btn--sm">
                          <Icon name="pen-to-square" size={14} />
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(sub)} className="nv-btn nv-btn--ghost nv-btn--danger nv-btn--sm">
                          <Icon name="trash-can" size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingSlug === sub.slug && (
                    <tr className="na-row--edit">
                      <td colSpan={4}>
                        <h4 className="na-form__title">Edit &ldquo;{sub.title}&rdquo;</h4>
                        <SubcategoryForm
                          categories={[]}
                          title={formTitle} desc={formDesc} categorySlug={categorySlug} visibility={formVisibility}
                          setTitle={setFormTitle} setDesc={setFormDesc} setCategorySlug={() => {}} setVisibility={setFormVisibility}
                          onSave={saveEdit} onCancel={cancel} saving={saving} saveLabel="Save changes"
                          showCategory={false}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.title}"? This will also delete all ${confirmDelete.article_count} article(s) in this sub-category. This cannot be undone.`}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ─── Articles Tab ─────────────────────────────────────────────────────────────

function ArticlesTab({
  onToast,
  onPendingCount,
}: {
  onToast: (msg: string, type: 'success' | 'error') => void
  onPendingCount: (n: number) => void
}) {
  const [articles, setArticles] = useState<AdminArticle[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [subcategories, setSubcategories] = useState<AdminSubcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminArticle | null>(null)
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'pending' | 'published'>('')

  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fSubcategory, setFSubcategory] = useState('')
  const [fVisibility, setFVisibility] = useState<VisibilityValue | ''>('')
  const [fContent, setFContent] = useState('')
  const [fReadTime, setFReadTime] = useState('5')
  const [fFeatured, setFFeatured] = useState(false)
  const [fHero, setFHero] = useState('')
  const [fHeroAlt, setFHeroAlt] = useState('')
  // True once startEdit has fetched the stored HTML. Until then an empty editor means
  // "leave the content unchanged", never "wipe it".
  const [fContentLoaded, setFContentLoaded] = useState(false)
  // Which row's body the in-flight startEdit fetch belongs to (guards against a late
  // response landing in a different row's form).
  const editKeyRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [artRes, catRes, subRes] = await Promise.all([
        fetch('/api/admin/articles'),
        fetch('/api/admin/categories'),
        fetch('/api/admin/subcategories'),
      ])
      const [artData, catData, subData] = await Promise.all([artRes.json(), catRes.json(), subRes.json()])
      const arts: AdminArticle[] = Array.isArray(artData) ? artData : []
      setArticles(arts)
      setCategories(Array.isArray(catData) ? catData : [])
      setSubcategories(Array.isArray(subData) ? subData : [])
      onPendingCount(arts.filter(a => a.status === 'pending').length)
    } catch {
      onToast('Failed to load articles.', 'error')
    } finally {
      setLoading(false)
    }
  }, [onToast, onPendingCount])

  useEffect(() => { load() }, [load])

  const filtered = articles
    .filter(a => !filterCategory || a.category_slug === filterCategory)
    .filter(a => !filterStatus || a.status === filterStatus)

  async function startEdit(art: AdminArticle) {
    const key = `${art.category_slug}/${art.slug}`
    editKeyRef.current = key
    setEditingKey(key)
    setFTitle(art.title)
    setFDesc(art.description)
    setFCategory(art.category_slug)
    setFSubcategory(art.subcategory_slug)
    setFVisibility(art.visibility ?? '')
    setFContent('')
    setFHero('')
    setFHeroAlt('')
    setFContentLoaded(false)
    setFReadTime(String(art.read_time))
    setFFeatured(art.featured)
    setShowAdd(false)

    // The list endpoint omits the HTML body; fetch it so the editor shows the real article.
    try {
      const res = await fetch(`/api/admin/articles/${art.category_slug}/${art.slug}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (editKeyRef.current !== key) return
      const { hero, body } = extractHero(data.content ?? '')
      setFContent(body)
      setFHero(hero?.src ?? '')
      setFHeroAlt(hero?.alt ?? '')
      setFContentLoaded(true)
    } catch {
      if (editKeyRef.current !== key) return
      onToast('Could not load the article body. Existing content will be kept unless you type something.', 'error')
    }
  }

  function startAdd() {
    setShowAdd(true)
    setEditingKey(null)
    setFTitle('')
    setFDesc('')
    const initialCategory = filterCategory || (categories[0]?.slug ?? '')
    setFCategory(initialCategory)
    setFSubcategory(subcategories.find(s => s.category_slug === initialCategory)?.slug ?? '')
    setFVisibility('')
    setFContent('')
    setFReadTime('5')
    setFFeatured(false)
    setFHero('')
    setFHeroAlt('')
    setFContentLoaded(false)
    editKeyRef.current = null
  }

  function cancel() {
    editKeyRef.current = null
    setEditingKey(null)
    setShowAdd(false)
  }

  async function saveEdit(art: AdminArticle) {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: fTitle,
        description: fDesc,
        readTime: Number(fReadTime),
        featured: fFeatured,
        subcategorySlug: fSubcategory,
        visibility: fVisibility || null,
      }
      // Send content only when the editor holds the real body (or the author typed
      // something / set a hero) so a failed load can never blank an article.
      if (fContentLoaded || fContent.trim() || fHero.trim()) body.content = injectHero(fContent, fHero, fHeroAlt)
      const res = await fetch(`/api/articles/${art.category_slug}/${art.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Update failed.', 'error'); return }
      onToast('Article updated.', 'success')
      setEditingKey(null)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveAdd() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fTitle, description: fDesc, categorySlug: fCategory, subcategorySlug: fSubcategory,
          content: injectHero(fContent, fHero, fHeroAlt), readTime: Number(fReadTime), featured: fFeatured, visibility: fVisibility || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Create failed.', 'error'); return }
      onToast('Article created (pending review).', 'success')
      setShowAdd(false)
      await load()
    } catch {
      onToast('Network error.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(art: AdminArticle) {
    setConfirmDelete(null)
    try {
      const res = await fetch(`/api/admin/articles/${art.category_slug}/${art.slug}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Delete failed.', 'error'); return }
      onToast(`Article "${art.title}" deleted.`, 'success')
      await load()
    } catch {
      onToast('Network error.', 'error')
    }
  }

  async function doPublish(art: AdminArticle, action: 'publish' | 'unpublish') {
    try {
      const res = await fetch(`/api/admin/articles/${art.category_slug}/${art.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Action failed.', 'error'); return }
      onToast(
        action === 'publish'
          ? `"${art.title}" is now live.`
          : `"${art.title}" moved back to pending.`,
        'success'
      )
      await load()
    } catch {
      onToast('Network error.', 'error')
    }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div className="na-toolbar">
        <div className="na-toolbar__left">
          <span>{filtered.length} of {articles.length} articles</span>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="na-select"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as '' | 'pending' | 'published')}
            className="na-select"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="published">Published</option>
          </select>
        </div>
        {!showAdd && (
          <button type="button" onClick={startAdd} className="nv-btn">
            <Icon name="plus" size={16} />
            Add article
          </button>
        )}
      </div>

      {showAdd && (
        <div className="na-card na-card--form">
          <h4 className="na-form__title">New article</h4>
          <p className="na-notice" style={{ marginBottom: 20 }}>
            New articles are saved as <strong>Pending</strong> and must be published before they appear publicly.
          </p>
          <ArticleForm
            categories={categories} subcategories={subcategories}
            title={fTitle} desc={fDesc} category={fCategory} subcategory={fSubcategory}
            content={fContent} readTime={fReadTime} featured={fFeatured} visibility={fVisibility}
            setTitle={setFTitle} setDesc={setFDesc}
            setCategory={v => { setFCategory(v); setFSubcategory(subcategories.find(s => s.category_slug === v)?.slug ?? '') }}
            setSubcategory={setFSubcategory} setContent={setFContent}
            setReadTime={setFReadTime} setFeatured={setFFeatured} setVisibility={setFVisibility}
            onSave={saveAdd} onCancel={cancel} saving={saving} saveLabel="Create article"
            showCategory
            hero={fHero} setHero={setFHero} showHero
          />
        </div>
      )}

      <div className="na-card na-card--table">
        <table className="na-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Category / sub-category</th>
              <th className="na-table__c">Read time</th>
              <th className="na-table__c">Status</th>
              <th className="na-table__c">Visibility</th>
              <th className="na-table__c">Vector DB</th>
              <th className="na-table__r" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(art => {
              const key = `${art.category_slug}/${art.slug}`
              const tier = TIERS.find(t => t.value === art.vector_tier)
              return (
                <Fragment key={key}>
                  <tr className="na-row">
                    <td>
                      <button type="button" onClick={() => startEdit(art)} className="na-table__title">
                        {art.title}
                        {art.featured && <Icon name="bookmark" size={14} alt="Featured" />}
                      </button>
                      <p className="na-table__desc">{art.description}</p>
                      <p className="na-table__slug">{art.slug}</p>
                    </td>
                    <td>
                      <span className="na-table__sub">{art.category_title}</span>
                      <span className="na-table__sub">{art.subcategory_title}</span>
                    </td>
                    <td className="na-table__c">
                      <span className="na-table__sub">{art.read_time} min</span>
                    </td>
                    <td className="na-table__c">
                      <StatusBadge status={art.status} />
                    </td>
                    <td className="na-table__c">
                      <VisibilityBadge visibility={effectiveVisibility(art)} inherited={!art.visibility} />
                    </td>
                    <td className="na-table__c">
                      {art.vector_tier ? (
                        <span className={`na-badge ${tier?.badge ?? 'na-badge--neutral'}`}>
                          {tier?.label ?? art.vector_tier}
                        </span>
                      ) : (
                        <span className="na-table__sub">—</span>
                      )}
                    </td>
                    <td>
                      <div className="na-actions">
                        {art.status === 'pending' ? (
                          <button type="button" onClick={() => doPublish(art, 'publish')} className="nv-btn nv-btn--ghost nv-btn--sm">
                            <Icon name="cloud-arrow-up" size={14} />
                            Publish
                          </button>
                        ) : (
                          <button type="button" onClick={() => doPublish(art, 'unpublish')} className="nv-btn nv-btn--ghost nv-btn--sm">
                            <Icon name="eye-slash" size={14} />
                            Unpublish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSyncTarget({ categorySlug: art.category_slug, slug: art.slug, title: art.title })}
                          className="nv-btn nv-btn--ghost nv-btn--sm"
                        >
                          <Icon name="arrows-rotate" size={14} />
                          Sync
                        </button>
                        <button type="button" onClick={() => startEdit(art)} className="nv-btn nv-btn--ghost nv-btn--sm">
                          <Icon name="pen-to-square" size={14} />
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(art)} className="nv-btn nv-btn--ghost nv-btn--danger nv-btn--sm">
                          <Icon name="trash-can" size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingKey === key && (
                    <tr className="na-row--edit">
                      <td colSpan={7}>
                        <h4 className="na-form__title">Edit &ldquo;{art.title}&rdquo;</h4>
                        <ArticleForm
                          categories={categories} subcategories={subcategories}
                          title={fTitle} desc={fDesc} category={fCategory} subcategory={fSubcategory}
                          content={fContent} readTime={fReadTime} featured={fFeatured} visibility={fVisibility}
                          setTitle={setFTitle} setDesc={setFDesc} setCategory={setFCategory} setSubcategory={setFSubcategory}
                          setContent={setFContent} setReadTime={setFReadTime} setFeatured={setFFeatured} setVisibility={setFVisibility}
                          onSave={() => saveEdit(art)} onCancel={cancel} saving={saving} saveLabel="Save changes"
                          showCategory={false}
                          hero={fHero} setHero={setFHero} showHero
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="na-empty">
                  {articles.length === 0 ? 'No articles yet.' : 'No articles match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.title}"? This cannot be undone.`}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {syncTarget && (
        <SyncModal target={syncTarget} onClose={(synced) => { setSyncTarget(null); if (synced) load() }} />
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS: { key: 'categories' | 'articles'; label: string }[] = [
  { key: 'categories', label: 'Categories' },
  { key: 'articles',   label: 'Articles' },
]

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'categories' | 'articles'>('categories')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  return (
    <div>
      <div className="na-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`na-tab${activeTab === tab.key ? ' na-tab--active' : ''}`}
          >
            {tab.label}
            {tab.key === 'articles' && pendingCount > 0 && (
              <span className="na-tab__count" title={`${pendingCount} pending`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && <CategoriesTab onToast={showToast} />}
      {activeTab === 'articles' && <ArticlesTab onToast={showToast} onPendingCount={setPendingCount} />}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

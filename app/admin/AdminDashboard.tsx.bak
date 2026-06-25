'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminCategory {
  slug: string
  title: string
  description: string
  icon: string
  article_count: number
  sort_order: number
}

interface AdminArticle {
  slug: string
  title: string
  description: string
  category_slug: string
  category_title: string
  read_time: number
  featured: boolean
  sort_order: number
  updated_at: string
}

type SyncTier = 'domain' | 'internal' | 'client' | 'confidential'

interface SyncTarget {
  categorySlug: string
  slug: string
  title: string
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIERS: { value: SyncTier; label: string; description: string; color: string }[] = [
  { value: 'domain', label: 'Domain', description: 'Public-facing knowledge for all Nuvho clients', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'internal', label: 'Internal', description: 'Nuvho staff only — internal operations', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'client', label: 'Client', description: 'Shared with specific hotel clients', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'confidential', label: 'Confidential', description: 'Restricted — executive or sensitive data', color: 'bg-red-100 text-red-800 border-red-200' },
]

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg font-body text-sm max-w-sm
      ${type === 'success' ? 'bg-tropical-teal text-white' : 'bg-red-500 text-white'}`}>
      {type === 'success' ? (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span>{message}</span>
      <button onClick={onClose} className="ml-auto shrink-0 opacity-70 hover:opacity-100">✕</button>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-iron-grey text-base">Confirm Delete</h3>
            <p className="font-body text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-heading font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Sync Modal ───────────────────────────────────────────────────────────────

function SyncModal({ target, onClose }: { target: SyncTarget; onClose: () => void }) {
  const [tier, setTier] = useState<SyncTier>('domain')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSync() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/sync/${target.categorySlug}/${target.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full">
        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-tropical-teal/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-tropical-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-heading font-bold text-iron-grey mb-1">Synced Successfully</h3>
            <p className="font-body text-sm text-gray-500 mb-5">
              <span className="font-medium">{target.title}</span> has been synced to the <span className="font-medium capitalize">{tier}</span> tier.
            </p>
            <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-heading font-bold text-iron-grey text-base">Sync to Vector DB</h3>
                <p className="font-body text-xs text-gray-400 mt-0.5 truncate max-w-xs">{target.title}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="font-body text-sm text-gray-600 mb-4">Select the access tier for this article&apos;s embeddings:</p>

            <div className="space-y-2 mb-5">
              {TIERS.map(t => (
                <label key={t.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                  ${tier === t.value ? `${t.color} border-current` : 'border-gray-200 hover:border-gray-300'}`}>
                  <input
                    type="radio"
                    name="tier"
                    value={t.value}
                    checked={tier === t.value}
                    onChange={() => setTier(t.value)}
                    className="mt-0.5 accent-blue-slate"
                  />
                  <div>
                    <span className="font-heading font-semibold text-sm capitalize">{t.label}</span>
                    <p className="font-body text-xs opacity-75 mt-0.5">{t.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {error && <p className="font-body text-sm text-red-500 mb-3">{error}</p>}

            <div className="flex gap-3 justify-end">
              <button onClick={onClose} className="btn-outline px-4 py-2 text-sm" disabled={loading}>Cancel</button>
              <button
                onClick={handleSync}
                disabled={loading}
                className="btn-primary px-5 py-2 text-sm flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Syncing&hellip;
                  </>
                ) : 'Confirm Sync'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Category form ────────────────────────────────────────────────────────────

function CategoryForm({ title, desc, icon, setTitle, setDesc, setIcon, onSave, onCancel, saving, saveLabel }: {
  title: string; desc: string; icon: string
  setTitle: (v: string) => void; setDesc: (v: string) => void; setIcon: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean; saveLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Title *</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Booking &amp; Reservations"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate transition-colors"
          />
        </div>
        <div>
          <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Icon filename</label>
          <input
            value={icon} onChange={e => setIcon(e.target.value)}
            placeholder="e.g. booking.svg"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Description *</label>
        <textarea
          value={desc} onChange={e => setDesc(e.target.value)}
          rows={2}
          placeholder="Short description of this category…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate transition-colors resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-outline px-4 py-2 text-sm" disabled={saving}>Cancel</button>
        <button
          onClick={onSave}
          disabled={saving || !title.trim() || !desc.trim()}
          className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
        >
          {saving && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Article form ─────────────────────────────────────────────────────────────

function ArticleForm({ categories, title, desc, category, content, readTime, featured,
  setTitle, setDesc, setCategory, setContent, setReadTime, setFeatured,
  onSave, onCancel, saving, saveLabel, showCategory }: {
  categories: AdminCategory[]
  title: string; desc: string; category: string; content: string; readTime: string; featured: boolean
  setTitle: (v: string) => void; setDesc: (v: string) => void; setCategory: (v: string) => void
  setContent: (v: string) => void; setReadTime: (v: string) => void; setFeatured: (v: boolean) => void
  onSave: () => void; onCancel: () => void; saving: boolean; saveLabel: string; showCategory: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={showCategory ? '' : 'sm:col-span-2'}>
          <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Article title"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate transition-colors" />
        </div>
        {showCategory && (
          <div>
            <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Category *</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate">
              {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Description *</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Short description…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate transition-colors resize-none" />
      </div>
      <div>
        <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">
          Content (HTML) <span className="text-gray-300 font-normal">— leave blank to keep existing</span>
        </label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={5} placeholder="<p>Article HTML content…</p>"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-iron-grey focus:outline-none focus:border-blue-slate transition-colors resize-y" />
      </div>
      <div className="flex items-center gap-4">
        <div>
          <label className="block font-heading text-xs font-semibold text-gray-500 mb-1">Read time (min)</label>
          <input type="number" min={1} max={60} value={readTime} onChange={e => setReadTime(e.target.value)}
            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-4">
          <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)}
            className="w-4 h-4 accent-blue-slate" />
          <span className="font-heading text-xs font-semibold text-gray-500">Featured article</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-outline px-4 py-2 text-sm" disabled={saving}>Cancel</button>
        <button onClick={onSave} disabled={saving || !title.trim() || !desc.trim()} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          {saving && (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminCategory | null>(null)
  const [saving, setSaving] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formIcon, setFormIcon] = useState('')

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
    setShowAdd(false)
  }

  function startAdd() {
    setShowAdd(true)
    setEditingSlug(null)
    setFormTitle('')
    setFormDesc('')
    setFormIcon('')
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
        body: JSON.stringify({ title: formTitle, description: formDesc, icon: formIcon }),
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
        body: JSON.stringify({ title: formTitle, description: formDesc, icon: formIcon }),
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

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <svg className="w-6 h-6 animate-spin text-blue-slate" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-sm text-gray-500">
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        </p>
        {!showAdd && (
          <button onClick={startAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Category
          </button>
        )}
      </div>

      {showAdd && (
        <div className="nuvho-card p-5 mb-4 border-2 border-tropical-teal/30">
          <h4 className="font-heading font-semibold text-iron-grey text-sm mb-3">New Category</h4>
          <CategoryForm
            title={formTitle} desc={formDesc} icon={formIcon}
            setTitle={setFormTitle} setDesc={setFormDesc} setIcon={setFormIcon}
            onSave={saveAdd} onCancel={cancel} saving={saving} saveLabel="Create Category"
          />
        </div>
      )}

      <div className="nuvho-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left font-heading font-semibold text-gray-400 text-xs px-5 py-3 uppercase tracking-wide">Category</th>
              <th className="text-left font-heading font-semibold text-gray-400 text-xs px-3 py-3 uppercase tracking-wide hidden md:table-cell">Icon</th>
              <th className="text-center font-heading font-semibold text-gray-400 text-xs px-3 py-3 uppercase tracking-wide">Articles</th>
              <th className="px-5 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <>
                <tr key={cat.slug} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-heading font-semibold text-iron-grey">{cat.title}</p>
                    <p className="font-body text-xs text-gray-400 mt-0.5 truncate max-w-xs">{cat.description}</p>
                    <p className="font-mono text-xs text-gray-300 mt-0.5">{cat.slug}</p>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="font-mono text-xs text-gray-400">{cat.icon || '—'}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-slate font-heading font-semibold text-xs">
                      {cat.article_count}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(cat)} className="text-xs font-heading font-semibold text-blue-slate hover:text-blue-slate/70 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => setConfirmDelete(cat)} className="text-xs font-heading font-semibold text-red-400 hover:text-red-600 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {editingSlug === cat.slug && (
                  <tr key={`${cat.slug}-edit`} className="bg-blue-50/40">
                    <td colSpan={4} className="px-5 py-4">
                      <h4 className="font-heading font-semibold text-iron-grey text-sm mb-3">Edit &ldquo;{cat.title}&rdquo;</h4>
                      <CategoryForm
                        title={formTitle} desc={formDesc} icon={formIcon}
                        setTitle={setFormTitle} setDesc={setFormDesc} setIcon={setFormIcon}
                        onSave={saveEdit} onCancel={cancel} saving={saving} saveLabel="Save Changes"
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center font-body text-sm text-gray-400">
                  No categories yet. Click &ldquo;Add Category&rdquo; to create one.
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

// ─── Articles Tab ─────────────────────────────────────────────────────────────

function ArticlesTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [articles, setArticles] = useState<AdminArticle[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminArticle | null>(null)
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')

  const [fTitle, setFTitle] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fContent, setFContent] = useState('')
  const [fReadTime, setFReadTime] = useState('5')
  const [fFeatured, setFFeatured] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [artRes, catRes] = await Promise.all([
        fetch('/api/admin/articles'),
        fetch('/api/admin/categories'),
      ])
      const [artData, catData] = await Promise.all([artRes.json(), catRes.json()])
      setArticles(Array.isArray(artData) ? artData : [])
      setCategories(Array.isArray(catData) ? catData : [])
    } catch {
      onToast('Failed to load articles.', 'error')
    } finally {
      setLoading(false)
    }
  }, [onToast])

  useEffect(() => { load() }, [load])

  const filtered = filterCategory ? articles.filter(a => a.category_slug === filterCategory) : articles

  function startEdit(art: AdminArticle) {
    setEditingKey(`${art.category_slug}/${art.slug}`)
    setFTitle(art.title)
    setFDesc(art.description)
    setFCategory(art.category_slug)
    setFContent('')
    setFReadTime(String(art.read_time))
    setFFeatured(art.featured)
    setShowAdd(false)
  }

  function startAdd() {
    setShowAdd(true)
    setEditingKey(null)
    setFTitle('')
    setFDesc('')
    setFCategory(filterCategory || (categories[0]?.slug ?? ''))
    setFContent('')
    setFReadTime('5')
    setFFeatured(false)
  }

  function cancel() {
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
      }
      if (fContent.trim()) body.content = fContent
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
          title: fTitle, description: fDesc, categorySlug: fCategory,
          content: fContent, readTime: Number(fReadTime), featured: fFeatured,
        }),
      })
      const data = await res.json()
      if (!res.ok) { onToast(data.error || 'Create failed.', 'error'); return }
      onToast('Article created.', 'success')
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

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <svg className="w-6 h-6 animate-spin text-blue-slate" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="font-body text-sm text-gray-500">{filtered.length} of {articles.length} articles</p>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-body text-iron-grey focus:outline-none focus:border-blue-slate"
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
        </div>
        {!showAdd && (
          <button onClick={startAdd} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Article
          </button>
        )}
      </div>

      {showAdd && (
        <div className="nuvho-card p-5 mb-4 border-2 border-tropical-teal/30">
          <h4 className="font-heading font-semibold text-iron-grey text-sm mb-3">New Article</h4>
          <ArticleForm
            categories={categories}
            title={fTitle} desc={fDesc} category={fCategory} content={fContent} readTime={fReadTime} featured={fFeatured}
            setTitle={setFTitle} setDesc={setFDesc} setCategory={setFCategory} setContent={setFContent}
            setReadTime={setFReadTime} setFeatured={setFFeatured}
            onSave={saveAdd} onCancel={cancel} saving={saving} saveLabel="Create Article"
            showCategory
          />
        </div>
      )}

      <div className="nuvho-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left font-heading font-semibold text-gray-400 text-xs px-5 py-3 uppercase tracking-wide">Article</th>
              <th className="text-left font-heading font-semibold text-gray-400 text-xs px-3 py-3 uppercase tracking-wide hidden lg:table-cell">Category</th>
              <th className="text-center font-heading font-semibold text-gray-400 text-xs px-3 py-3 uppercase tracking-wide hidden md:table-cell">Time</th>
              <th className="px-5 py-3 w-36"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(art => {
              const key = `${art.category_slug}/${art.slug}`
              return (
                <>
                  <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-heading font-semibold text-iron-grey">{art.title}</p>
                        {art.featured && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-heading font-semibold bg-yellow-100 text-yellow-700">★</span>
                        )}
                      </div>
                      <p className="font-body text-xs text-gray-400 mt-0.5 truncate max-w-xs">{art.description}</p>
                      <p className="font-mono text-xs text-gray-300 mt-0.5">{art.slug}</p>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="font-body text-xs text-gray-500">{art.category_title}</span>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className="font-body text-xs text-gray-400">{art.read_time}m</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setSyncTarget({ categorySlug: art.category_slug, slug: art.slug, title: art.title })}
                          className="text-xs font-heading font-semibold text-tropical-teal hover:text-tropical-teal/70 transition-colors whitespace-nowrap"
                        >
                          Sync
                        </button>
                        <button
                          onClick={() => startEdit(art)}
                          className="text-xs font-heading font-semibold text-blue-slate hover:text-blue-slate/70 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(art)}
                          className="text-xs font-heading font-semibold text-red-400 hover:text-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingKey === key && (
                    <tr key={`${key}-edit`} className="bg-blue-50/40">
                      <td colSpan={4} className="px-5 py-4">
                        <h4 className="font-heading font-semibold text-iron-grey text-sm mb-3">Edit &ldquo;{art.title}&rdquo;</h4>
                        <ArticleForm
                          categories={categories}
                          title={fTitle} desc={fDesc} category={fCategory} content={fContent} readTime={fReadTime} featured={fFeatured}
                          setTitle={setFTitle} setDesc={setFDesc} setCategory={setFCategory} setContent={setFContent}
                          setReadTime={setFReadTime} setFeatured={setFFeatured}
                          onSave={() => saveEdit(art)} onCancel={cancel} saving={saving} saveLabel="Save Changes"
                          showCategory={false}
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center font-body text-sm text-gray-400">
                  {articles.length === 0 ? 'No articles yet.' : 'No articles in this category.'}
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
        <SyncModal target={syncTarget} onClose={() => setSyncTarget(null)} />
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'categories' | 'articles'>('categories')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
        {(['categories', 'articles'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-heading font-semibold capitalize transition-all
              ${activeTab === tab
                ? 'bg-blue-slate text-white shadow-sm'
                : 'text-gray-400 hover:text-iron-grey'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'categories'
        ? <CategoriesTab onToast={showToast} />
        : <ArticlesTab onToast={showToast} />
      }

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  categorySlug: string
  slug: string
  initialTitle: string
  initialDescription: string
  initialContent: string
  initialReadTime: number
}

export default function ArticleEditForm({
  categorySlug,
  slug,
  initialTitle,
  initialDescription,
  initialContent,
  initialReadTime,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [content, setContent] = useState(initialContent)
  const [readTime, setReadTime] = useState(String(initialReadTime))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const res = await fetch(`/api/articles/${categorySlug}/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, content, readTime }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Save failed. Please try again.')
        return
      }

      // Redirect back to the article
      router.push(`/articles/${categorySlug}/${slug}`)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-platinum font-body text-iron-grey text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-slate/30 focus:border-blue-slate ' +
    'placeholder-gray-400 bg-white'

  const labelClass = 'block text-sm font-heading font-semibold text-iron-grey mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label className={labelClass}>Title <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={inputClass}
          placeholder="Article title"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description <span className="text-red-400">*</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={`${inputClass} resize-none`}
          rows={3}
          placeholder="Short summary shown in article listings and the article header"
          required
        />
      </div>

      {/* Content */}
      <div>
        <label className={labelClass}>
          Content
          <span className="ml-2 text-xs font-body font-normal text-gray-400">(HTML supported)</span>
        </label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className={`${inputClass} font-mono text-xs resize-y`}
          rows={18}
          placeholder="<p>Article body…</p>"
        />
      </div>

      {/* Read time */}
      <div className="max-w-[140px]">
        <label className={labelClass}>Read time (minutes)</label>
        <input
          type="number"
          min={1}
          max={60}
          value={readTime}
          onChange={e => setReadTime(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 font-body bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary text-sm py-2.5 px-6 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <a
          href={`/articles/${categorySlug}/${slug}`}
          className="btn-outline text-sm py-2.5 px-6"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}

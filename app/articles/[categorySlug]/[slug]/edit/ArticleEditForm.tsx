'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { extractHero, injectHero } from '@/components/heroImage'
import RichTextEditor from '@/components/RichTextEditor'
import ImageUploadField from '@/components/ImageUploadField'

interface Props {
  categorySlug: string
  slug: string
  initialTitle: string
  initialDescription: string
  initialContent: string
  initialReadTime: number
}

// Fields follow the Figma field law (browser-app §5); buttons the Figma Button (§4).
// The hero image lives at the top of the article HTML (see components/heroImage.ts);
// this form edits it as its own field and keeps the body HTML separate. The body is
// edited in TinyMCE (components/RichTextEditor.tsx); images dropped into it are uploaded
// to /api/admin/uploads and referenced by URL. The server sanitises on save (lib/sanitize.ts).
export default function ArticleEditForm({
  categorySlug, slug, initialTitle, initialDescription, initialContent, initialReadTime,
}: Props) {
  const router = useRouter()
  const initial = extractHero(initialContent)

  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [heroSrc, setHeroSrc] = useState(initial.hero?.src ?? '')
  const [heroAlt, setHeroAlt] = useState(initial.hero?.alt ?? '')
  const [body, setBody] = useState(initial.body)
  const [readTime, setReadTime] = useState(String(initialReadTime))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const content = injectHero(body, heroSrc, heroAlt)
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
      router.push(`/articles/${categorySlug}/${slug}`)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="na-form">
      <div className="na-field">
        <label className="na-label" htmlFor="title">Title <span className="na-req">*</span></label>
        <input id="title" type="text" value={title} onChange={e => setTitle(e.target.value)} className="na-input" placeholder="Article title" required />
      </div>

      <div className="na-field">
        <label className="na-label" htmlFor="description">Description <span className="na-req">*</span></label>
        <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} className="na-textarea" placeholder="Short summary shown in article listings and the article header" required />
        <span className="na-help">Shown on tiles and under the title. One or two sentences.</span>
      </div>

      <div className="na-field">
        <label className="na-label" htmlFor="heroSrc">Hero image <small>optional</small></label>
        <ImageUploadField
          id="heroSrc"
          value={heroSrc}
          onChange={setHeroSrc}
          disabled={saving}
          help="Shown full-width behind the title under the Tropical Teal veil, and on article tiles. Upload a JPG, PNG, WebP or GIF up to 10 MB, or paste a URL. Leave blank for the gradient hero."
        />
      </div>

      {heroSrc.trim() && (
        <div className="na-field">
          <label className="na-label" htmlFor="heroAlt">Hero image alt text</label>
          <input id="heroAlt" type="text" value={heroAlt} onChange={e => setHeroAlt(e.target.value)} className="na-input" placeholder="What the picture shows" />
        </div>
      )}

      <div className="na-field">
        <label className="na-label" htmlFor="content">Content</label>
        <RichTextEditor id="content" value={body} onChange={setBody} disabled={saving} minHeight={420} />
        <span className="na-help">
          Drag, paste or insert images straight into the text and they upload automatically.
          The <strong>&lt;&gt;</strong> button opens the raw HTML for anything the toolbar does not cover.
        </span>
      </div>

      <div className="na-field na-field--sm">
        <label className="na-label" htmlFor="readTime">Read time (minutes)</label>
        <input id="readTime" type="number" min={1} max={60} value={readTime} onChange={e => setReadTime(e.target.value)} className="na-input" />
      </div>

      {error && <p className="na-error" role="alert">{error}</p>}

      <div className="na-form__actions">
        <Link href={`/articles/${categorySlug}/${slug}`} className="nv-btn nv-btn--secondary">Cancel</Link>
        <button type="submit" disabled={saving} className="nv-btn">
          {saving && <span className="nv-spin nv-spin--sm nv-spin--w" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/Icon'
import { ACCEPTED_IMAGE_TYPES, uploadImage } from '@/lib/uploadClient'

interface Props {
  id?: string
  /** Current image URL (empty string = none). */
  value: string
  onChange: (url: string) => void
  help?: string
  disabled?: boolean
}

// URL field + Upload button + thumbnail, used for the article hero image on the Edit page
// and in the admin dashboard. Uploads go through /api/admin/uploads (images only) and the
// returned /uploads/… URL is written back into the field, so pasted URLs keep working too.
export default function ImageUploadField({ id = 'heroSrc', value, onChange, help, disabled = false }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    setPct(0)
    try {
      const r = await uploadImage(file, file.name, setPct)
      onChange(r.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const src = value.trim()

  return (
    <div className="na-upload">
      <div className="na-hero-preview">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" />
        )}
        <input
          id={id}
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="na-input"
          placeholder="Paste an image URL, or upload one"
          disabled={disabled || busy}
        />
        <button
          type="button"
          className="nv-btn nv-btn--secondary"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
        >
          {busy ? <span className="nv-spin nv-spin--sm" /> : <Icon name="cloud-arrow-up" size={16} />}
          {busy ? `Uploading ${pct}%` : 'Upload'}
        </button>
        {src && !busy && (
          <button type="button" className="nv-btn nv-btn--ghost" onClick={() => onChange('')} disabled={disabled}>
            <Icon name="xmark" size={14} />
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          hidden
          onChange={e => handleFile(e.target.files?.[0])}
        />
      </div>
      {help && <span className="na-help">{help}</span>}
      {error && <span className="na-error" role="alert">{error}</span>}
    </div>
  )
}

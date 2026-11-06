'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/Icon'
import { ACCEPTED_IMAGE_TYPES, uploadImage } from '@/lib/uploadClient'
import ImageLibraryPicker from '@/components/ImageLibraryPicker'

interface Props {
  id?: string
  /** Current image URL (empty string = none). */
  value: string
  onChange: (url: string) => void
  help?: string
  disabled?: boolean
  /** Adds "Choose from library" (Marketing SharePoint Image Repository). `previewUrl` builds
   *  the hero-preview page URL for a candidate image. Omit to hide the option. */
  library?: { previewUrl: (src: string) => string }
}

// URL field + Upload button + thumbnail, used for the article hero image on the Edit page
// and in the admin dashboard. Uploads go through /api/admin/uploads (images only) and the
// returned /uploads/… URL is written back into the field, so pasted URLs keep working too.
// With `library`, a third option opens the image library picker (components/ImageLibraryPicker.tsx).
export default function ImageUploadField({ id = 'heroSrc', value, onChange, help, disabled = false, library }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)

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
          // Not type="url": uploads and library photos are site-relative (/uploads/…), which
          // the browser's url validation rejects and would block the Edit page's form submit.
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
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
        {library && (
          <button
            type="button"
            className="nv-btn nv-btn--secondary"
            onClick={() => setLibraryOpen(true)}
            disabled={disabled || busy}
          >
            <Icon name="folder-open" size={16} />
            Choose from library
          </button>
        )}
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
      {library && libraryOpen && (
        <ImageLibraryPicker
          current={value}
          previewUrl={library.previewUrl}
          onSelect={img => { setError(''); onChange(img.url); setLibraryOpen(false) }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  )
}

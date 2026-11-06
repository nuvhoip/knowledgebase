'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/Icon'
import { buildCollections, matchesQuery, type LibraryImage } from '@/lib/imageLibrary'

interface Props {
  /** URL currently in the hero field, to mark it in the grid. */
  current?: string
  /** Builds the hero-preview page URL for a candidate image (title/description come from the unsaved form). */
  previewUrl: (src: string) => string
  onSelect: (image: LibraryImage) => void
  onClose: () => void
}

type Device = 'desktop' | 'mobile'
// Frame sizes the preview page is rendered at, then scaled to fit — so the site's own
// breakpoints (900px) apply exactly as they will on the published page.
const FRAME: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile:  { width: 390,  height: 844 },
}

// One fetch per page load; reopening the picker reuses it.
let libraryCache: Promise<LibraryImage[]> | null = null

function loadLibrary(): Promise<LibraryImage[]> {
  if (!libraryCache) {
    libraryCache = fetch('/api/admin/image-library', { credentials: 'same-origin' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `Could not load the image library (${res.status}).`)
        return data.images as LibraryImage[]
      })
      .catch(err => {
        libraryCache = null // allow a retry
        throw err
      })
  }
  return libraryCache
}

// Image library picker (Edit page hero field). Browse the photos imported from the
// Marketing SharePoint Image Repository, open one to see the real article hero and tile
// with this article's title, then confirm. Picking only fills the form field — nothing is
// saved until "Save changes".
export default function ImageLibraryPicker({ current = '', previewUrl, onSelect, onClose }: Props) {
  const [images, setImages] = useState<LibraryImage[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('') // '' = all
  const [selected, setSelected] = useState<LibraryImage | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const searchRef = useRef<HTMLInputElement>(null)

  function retry() {
    setError('')
    setImages(null)
    loadLibrary().then(setImages, err => setError(err.message))
  }

  useEffect(() => {
    loadLibrary().then(setImages, err => setError(err.message))
  }, [])

  // Lock page scroll behind the modal; Escape steps back from the preview, then closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (selected) setSelected(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, onClose])

  useEffect(() => {
    if (images && !selected) searchRef.current?.focus()
  }, [images, selected])

  const collections = useMemo(() => buildCollections(images ?? []), [images])
  const groups = useMemo(() => Array.from(new Set(collections.map(c => c.group))), [collections])
  const visible = useMemo(
    () => (images ?? []).filter(img => (!collection || img.collection === collection) && matchesQuery(img, query)),
    [images, collection, query],
  )

  return (
    <div className="na-overlay" role="dialog" aria-modal="true" aria-labelledby="library-title">
      <div className="na-modal na-modal--library">
        <div className="na-modal__head">
          <div>
            <h3 id="library-title" className="na-modal__title">{selected ? 'Preview hero image' : 'Image library'}</h3>
            <p className="na-modal__sub">
              {selected
                ? 'How this article will look with the photo — scroll the preview to see the article tile. Nothing is saved until you save the article.'
                : `Marketing › Image Repository${images ? ` · ${images.length} photos` : ''}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="na-modal__close" aria-label="Close">
            <Icon name="xmark" size={14} />
          </button>
        </div>

        {selected ? (
          <PreviewStep image={selected} device={device} setDevice={setDevice} src={previewUrl(selected.url)} />
        ) : (
          <div className="na-library">
            <aside className="na-library__filters" aria-label="Collections">
              <button
                type="button"
                className={`na-library__filter${collection === '' ? ' is-active' : ''}`}
                onClick={() => setCollection('')}
              >
                <span>All photos</span><span className="na-library__count">{images?.length ?? ''}</span>
              </button>
              {groups.map(group => (
                <div key={group} className="na-library__group">
                  <p className="na-library__group-title">{group}</p>
                  {collections.filter(c => c.group === group).map(c => (
                    <button
                      key={c.path}
                      type="button"
                      className={`na-library__filter${collection === c.path ? ' is-active' : ''}`}
                      onClick={() => setCollection(c.path)}
                    >
                      <span>{c.label}</span><span className="na-library__count">{c.count}</span>
                    </button>
                  ))}
                </div>
              ))}
            </aside>

            <div className="na-library__main">
              <div className="na-library__toolbar">
                <input
                  ref={searchRef}
                  type="search"
                  className="na-input"
                  placeholder="Search by file name, photographer or folder"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  aria-label="Search the image library"
                />
                {collections.length > 0 && (
                  <select
                    className="na-select na-library__select"
                    value={collection}
                    onChange={e => setCollection(e.target.value)}
                    aria-label="Collection"
                  >
                    <option value="">All photos</option>
                    {collections.map(c => (
                      <option key={c.path} value={c.path}>{c.group === c.label ? c.label : `${c.group} › ${c.label}`}</option>
                    ))}
                  </select>
                )}
              </div>

              {error ? (
                <div className="na-library__empty" role="alert">
                  <p className="na-error">{error}</p>
                  <button type="button" className="nv-btn nv-btn--secondary" onClick={retry}>Try again</button>
                </div>
              ) : !images ? (
                <div className="na-library__empty"><span className="nv-spin" /> Loading photos…</div>
              ) : visible.length === 0 ? (
                <div className="na-library__empty">
                  {images.length === 0 ? 'No photos have been imported yet.' : 'No photos match your search.'}
                </div>
              ) : (
                <ul className="na-library__grid">
                  {visible.map(img => {
                    const isCurrent = img.url === current.trim()
                    return (
                      <li key={img.id}>
                        <button
                          type="button"
                          className={`na-library__item${isCurrent ? ' is-current' : ''}`}
                          onClick={() => { setSelected(img); setDevice('desktop') }}
                          title={img.title}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.thumbUrl} alt="" loading="lazy" decoding="async" width={240} height={160} />
                          <span className="na-library__caption">
                            <span className="na-library__name">{img.credit ?? img.title}</span>
                            <span className="na-library__folder">{img.collection.split('/').pop()}</span>
                          </span>
                          {isCurrent && <span className="na-badge na-badge--info na-library__badge">Current</span>}
                          <span className="sr-only">Preview {img.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="na-modal__foot na-modal__foot--library">
          {selected ? (
            <>
              <button type="button" className="nv-btn nv-btn--secondary" onClick={() => setSelected(null)}>
                <Icon name="arrow-left" size={14} />
                Back to library
              </button>
              <button type="button" className="nv-btn" onClick={() => onSelect(selected)}>
                <Icon name="check" size={16} onDark />
                Use this image
              </button>
            </>
          ) : (
            <button type="button" className="nv-btn nv-btn--secondary" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Preview step ─────────────────────────────────────────────────────────────

function PreviewStep({ image, device, setDevice, src }: {
  image: LibraryImage
  device: Device
  setDevice: (d: Device) => void
  src: string
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [loaded, setLoaded] = useState(false)
  // Full height of the rendered preview page, so the stage can scroll down to the tile
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reload state whenever the frame URL or device changes
  useEffect(() => {
    setLoaded(false)
    setContentHeight(0)
    stageRef.current?.scrollTo({ top: 0 })
  }, [src, device])

  // The preview page is same-origin, so its document height can be read once it loads
  // (and again shortly after, once web fonts have settled).
  function measure() {
    const doc = frameRef.current?.contentDocument
    if (doc) setContentHeight(doc.documentElement.scrollHeight)
  }
  function handleLoad() {
    setLoaded(true)
    measure()
    window.setTimeout(measure, 400)
  }

  const frame = FRAME[device]
  // Both sizes are fitted to the stage width (never enlarged) and the stage scrolls through
  // the whole page, like scrolling the real article.
  const scale = stage.width
    ? Math.min(1, (stage.width - (device === 'mobile' ? 48 : 0)) / frame.width)
    : 0
  const frameHeight = Math.max(frame.height, contentHeight)

  return (
    <div className="na-library-preview">
      <div className="na-library-preview__bar">
        <div className="na-segmented" role="group" aria-label="Preview size">
          {(['desktop', 'mobile'] as Device[]).map(d => (
            <button
              key={d}
              type="button"
              className={`na-segmented__btn${device === d ? ' is-active' : ''}`}
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
            >
              {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
        <p className="na-library-preview__meta">
          <strong>{image.title}</strong>
          {image.credit && <> · {image.credit}</>}
          {' · '}{image.collection.replace(/\//g, ' › ')} · {image.width}×{image.height}
        </p>
      </div>

      <div ref={stageRef} className={`na-library-preview__stage na-library-preview__stage--${device}`}>
        {!loaded && <div className="na-library-preview__loading"><span className="nv-spin" /> Rendering preview…</div>}
        {scale > 0 && (
          <div
            className="na-library-preview__device"
            style={{ width: frame.width * scale, height: frameHeight * scale }}
          >
            <iframe
              ref={frameRef}
              key={`${device}:${src}`}
              src={src}
              title="Preview of the article hero with this image"
              tabIndex={-1}
              scrolling="no"
              onLoad={handleLoad}
              style={{
                width: frame.width,
                height: frameHeight,
                transform: `scale(${scale})`,
                opacity: loaded ? 1 : 0,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

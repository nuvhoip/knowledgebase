import { unzipSync } from 'fflate'
import path from 'path'

// Import bundles (decision 24 Nov 2026): a .zip holding a page and the files it uses —
// what Claude Code leaves in a folder (page.html + img/…, video/…), or what the
// nuvho-knowledge-save skill packs. The importer resolves the page's relative paths
// (<img src="img/chart.png">) against the files in here.
//
// Which page: manifest.json { "page": "…" } when the skill wrote one, else index.html, else
// the only .html outside hidden folders, else the largest (other pages, such as an older
// preview, are listed in the notes). Limits keep a hostile archive from exhausting memory.

export const MAX_BUNDLE_FILES = 300
export const MAX_BUNDLE_UNZIPPED = 250 * 1024 * 1024
export const MAX_BUNDLE_ZIPPED = 100 * 1024 * 1024

export class BundleError extends Error {}

export interface Bundle {
  pageName: string
  html: string
  /** Every other file, by normalised path relative to the bundle root. */
  files: Map<string, Buffer>
  notes: string[]
}

function normal(p: string): string | null {
  const n = path.posix.normalize(p.replace(/\\/g, '/')).replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!n || n === '.' || n.startsWith('../') || n.includes('/../') || n === '..') return null
  return n
}

const HIDDEN = /(^|\/)(\.|__MACOSX\/)/

export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05) && (buf[3] === 0x04 || buf[3] === 0x06)
}

export function readBundle(zip: Buffer): Bundle {
  if (zip.length > MAX_BUNDLE_ZIPPED) throw new BundleError('The .zip is larger than 100 MB.')
  let count = 0
  let total = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(zip.buffer, zip.byteOffset, zip.byteLength), {
      // Checked before each file is inflated, from the sizes in the archive's directory
      filter: f => {
        if (f.name.endsWith('/')) return false
        if (++count > MAX_BUNDLE_FILES) throw new BundleError(`The .zip holds more than ${MAX_BUNDLE_FILES} files.`)
        total += f.originalSize
        if (total > MAX_BUNDLE_UNZIPPED) throw new BundleError('The .zip unpacks to more than 250 MB.')
        return true
      },
    })
  } catch (err) {
    if (err instanceof BundleError) throw err
    throw new BundleError('That .zip could not be read.')
  }

  const files = new Map<string, Buffer>()
  for (const [name, data] of Object.entries(entries)) {
    const n = normal(name)
    if (!n || HIDDEN.test(n)) continue
    files.set(n, Buffer.from(data))
  }

  // Many zips wrap everything in one top folder ("scratch-2026-11-19-457c5c/…"): strip it
  const tops = new Set(Array.from(files.keys()).map(k => k.split('/')[0]))
  if (tops.size === 1 && Array.from(files.keys()).every(k => k.includes('/'))) {
    const top = Array.from(tops)[0] + '/'
    for (const [k, v] of Array.from(files.entries())) { files.delete(k); files.set(k.slice(top.length), v) }
  }

  const notes: string[] = []
  const pages = Array.from(files.keys()).filter(k => /\.html?$/i.test(k))
  if (!pages.length) throw new BundleError('The .zip has no .html page in it.')

  let pageName: string | undefined
  const manifest = files.get('manifest.json')
  if (manifest) {
    try {
      const m = JSON.parse(manifest.toString('utf8')) as { page?: unknown }
      const p = typeof m.page === 'string' ? normal(m.page) : null
      if (p && files.has(p)) pageName = p
    } catch { /* ignore a broken manifest */ }
  }
  pageName ??= pages.find(p => /(^|\/)index\.html?$/i.test(p) && !p.includes('/'))
    ?? (pages.length === 1 ? pages[0] : undefined)
    ?? pages.slice().sort((a, b) => files.get(b)!.length - files.get(a)!.length)[0]

  const others = pages.filter(p => p !== pageName)
  if (others.length) notes.push(`Imported ${pageName} from the .zip; ${others.length === 1 ? 'the other page' : 'the other pages'} (${others.join(', ')}) ${others.length === 1 ? 'was' : 'were'} not used.`)

  const html = files.get(pageName)!.toString('utf8')
  files.delete(pageName)
  files.delete('manifest.json')
  return { pageName, html, files, notes }
}

/** Resolves a page-relative reference ("img/a.png", "./img/a.png", "/img/a.png") to a bundle file. */
export function resolveBundlePath(bundle: Pick<Bundle, 'pageName' | 'files'>, ref: string): { name: string; data: Buffer } | null {
  let r = ref
  try { r = decodeURIComponent(ref) } catch { /* keep as is */ }
  const base = path.posix.dirname(bundle.pageName)
  const candidates = [
    normal(path.posix.join(base === '.' ? '' : base, r)),
    normal(r),
  ].filter((c): c is string => !!c)
  for (const c of candidates) {
    const data = bundle.files.get(c)
    if (data) return { name: c, data }
  }
  return null
}

// Naming helpers for the image library import (scripts/import-image-library.mjs).
// Plain ESM so the Node script can use them without a TypeScript step; covered by
// lib/imageLibrary.test.ts.

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

/** Normalise a path relative to the repository root to '/' separators, no leading slash. */
export function toSourcePath(relativePath) {
  return relativePath.split(/[\\/]+/).filter(Boolean).join('/')
}

/** 'Regions/UK/UK London/photo.jpg' → 'Regions/UK/UK London'. Files at the root → 'Unsorted'. */
export function collectionOf(sourcePath) {
  const parts = toSourcePath(sourcePath).split('/')
  parts.pop()
  return parts.length ? parts.join('/') : 'Unsorted'
}

/** Lower-case extension without the dot, or '' */
export function extensionOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

export function isImageFile(name) {
  return !name.startsWith('.') && !name.startsWith('~$') && IMAGE_EXTENSIONS.has(extensionOf(name))
}

/** Filename without folder or extension. */
export function titleOf(sourcePath) {
  const name = toSourcePath(sourcePath).split('/').pop() ?? ''
  return name.replace(/\.[a-z0-9]+$/i, '')
}

function titleCase(words) {
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const NAME_WORD = /^[a-z][a-z'’]*$/i

/**
 * Photographer credit from stock-site download names, else null:
 *   'jorg-angeli-1tyuLfDOnG0-unsplash'      → 'Jorg Angeli / Unsplash'
 *   'pexels-maria-kray-737731035-18587954'  → 'Maria Kray / Pexels'
 *   'pexels-principe-30052105'              → 'Principe / Pexels'
 *   'I154_34447127'                         → null
 */
export function creditOf(title) {
  // Unsplash: <name words>-<11-char photo id>-unsplash. The id can itself contain '-' or '_'
  // (e.g. 'rEn-AdBr3Ig'), so it is removed by length, not by splitting.
  const unsplash = /^(.+)-[A-Za-z0-9_-]{11}-unsplash$/i.exec(title)
  if (unsplash) {
    const words = unsplash[1].toLowerCase().split('-').filter(w => NAME_WORD.test(w))
    return words.length ? `${titleCase(words)} / Unsplash` : 'Unsplash'
  }
  const parts = title.toLowerCase().split('-').filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'pexels') {
    const words = parts.slice(1).filter(w => NAME_WORD.test(w))
    return words.length ? `${titleCase(words)} / Pexels` : 'Pexels'
  }
  return null
}

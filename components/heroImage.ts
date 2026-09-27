// Hero image convention — frontend-only, no schema change.
//
// An article's HTML may begin with:
//   <figure data-nv-hero><img src="https://…" alt="…"></figure>
// The article page lifts that figure out and renders it as the full-bleed photo hero
// (Figma 793:24); tiles and the featured block use it as their image. Editors expose a
// "Hero image URL" field that reads/writes this block, and authors may also write it by
// hand in the HTML. Everything after the figure is the article body.

export interface HeroImage {
  src: string
  alt: string
  srcSet?: string
}

const HERO_RE = /^\s*<figure\b[^>]*\bdata-nv-hero\b[^>]*>([\s\S]*?)<\/figure>\s*/i
const IMG_RE  = /<img\b[^>]*>/i
const SRC_RE  = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const ALT_RE  = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i

function attr(tag: string, re: RegExp): string {
  const m = tag.match(re)
  return m ? (m[1] ?? m[2] ?? '') : ''
}

/** Split article HTML into the hero image (if any) and the remaining body. */
export function extractHero(html: string | null | undefined): { hero: HeroImage | null; body: string } {
  if (!html) return { hero: null, body: '' }
  const m = html.match(HERO_RE)
  if (!m) return { hero: null, body: html }
  const img = m[1].match(IMG_RE)?.[0] ?? ''
  const src = attr(img, SRC_RE).trim()
  if (!src) return { hero: null, body: html }
  return { hero: { src, alt: attr(img, ALT_RE) }, body: html.slice(m[0].length) }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Prepend (or replace) the hero figure on a body. An empty src removes it. */
export function injectHero(body: string, src: string, alt = ''): string {
  const clean = extractHero(body).body
  const url = src.trim()
  if (!url) return clean
  return `<figure data-nv-hero><img src="${esc(url)}" alt="${esc(alt.trim())}"></figure>\n${clean}`
}

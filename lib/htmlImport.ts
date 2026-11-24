import { parseDocument, DomUtils } from 'htmlparser2'
import type { AnyNode, Element, Document } from 'domhandler'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { CALLOUT_ICONS, componentClasses, iconHtml, isArticleIcon, type CalloutVariant } from '@/lib/articleComponents'
import { embedHtml, isPlayableVideoUrl, isSharePointUrl, parseEmbedUrl, videoHtml } from '@/lib/embeds'

// "Import HTML" (decision 17 Nov 2026, assets 24 Nov 2026 / NUVCL-201): turns a standalone
// rich HTML page — a Claude document, artifact or DocNav page — into ordinary article HTML
// that uses the component vocabulary in lib/articleComponents.ts, as close to the source as
// the KB can show it.
//
// Two stages:
//   1. convertArticleHtml() (this file, pure): a tree → string render. Every asset the page
//      carries — inline SVG diagrams and icons, data: images, linked and relative images,
//      MP4 video — is collected as a PendingAsset and marked in the output with a
//      placeholder attribute (data-nv-asset="a1") exactly where it appeared.
//   2. lib/importPipeline.ts (server): stores each asset (lib/uploads.ts), swaps the
//      placeholders for /uploads/… URLs with resolveAssetPlaceholders(), sanitises, and records
//      the import so the editor can list, replace and re-insert the assets.
//
// importArticleHtml() runs stage 1 without storing anything (assets are dropped and
// reported): for tests and anything that cannot reach the file store.
//
// What goes: the page's own chrome (sidebar, header, footer, nav), scripts, forms, embedded
// fonts and logos in the chrome, section numbers and eyebrow labels above card headings. The
// first <h1> becomes the article title (later ones become <h2> sections), the meta
// description / subtitle the description, and tag chips the suggested tags.
//
// htmlparser2 is the version sanitize-html already uses (8.x, CommonJS — see lib/sanitize.ts).

export const IMPORTER_VERSION = 'kb-import 2.0.0'

export type AssetKind = 'svg' | 'image' | 'video'
export type AssetSource =
  | { type: 'svg'; svg: string }        // inline <svg> source, page CSS for it already folded in
  | { type: 'data'; uri: string }       // data: URI
  | { type: 'url'; url: string }        // absolute https URL (re-hosted on the KB)
  | { type: 'path'; path: string }      // relative path: a file in the uploaded .zip bundle

export interface PendingAsset {
  id: string
  kind: AssetKind
  /** icon (sized like text), figure (a diagram or picture on its own), inline (an image within text), video */
  role: 'icon' | 'figure' | 'inline' | 'video'
  source: AssetSource
  /** Human label for the editor's Assets panel: "Inline SVG — From one AI per vendor…", "img/chart.png" */
  ref: string
  alt: string
}

export interface ConvertResult {
  title: string
  description: string
  /** Tag chips / keywords found on the page (suggestions; up to 12). */
  tags: string[]
  /** Article HTML with data-nv-asset placeholders, NOT yet sanitised. */
  html: string
  assets: PendingAsset[]
  /** What inline drawings inherited from the page (font, text colour): applied when they are cleaned. */
  svgDefaults: { fontFamily: string; color: string }
  notes: string[]
}

export interface ImportResult {
  title: string
  description: string
  tags: string[]
  html: string
  /** Plain-language notes on what was changed or dropped, for the author. */
  notes: string[]
}

/** Elements removed with everything inside them. */
const DROP = new Set([
  'script', 'style', 'link', 'meta', 'noscript', 'template', 'title', 'head',
  'nav', 'header', 'footer', 'form', 'button', 'input', 'select', 'textarea', 'label',
  'object', 'embed', 'audio', 'math', 'dialog',
])

/** Elements copied through as themselves (attributes filtered by KEEP_ATTRS). */
const KEEP = new Set([
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'code', 'kbd', 'pre',
  'a', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'figcaption', 'dl', 'dt', 'dd',
])

const VOID = new Set(['br', 'hr', 'img', 'col'])

const KEEP_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  ol: ['start'],
  col: ['span'],
  h2: ['id'],
  h3: ['id'],
}

const BLOCK = /^(p|h[1-6]|ul|ol|dl|table|blockquote|pre|figure|div|hr|video)$/

interface Ctx {
  source: string
  inGrid: boolean
  inTable: boolean
  inCta: boolean
  inPre: boolean
  inFigure: boolean
  /** The first <h1> (the article title): dropped. Any later <h1> becomes an <h2> section. */
  titleEl: Element | null
  pageCss: string
  defaults: { fontFamily: string; color: string }
  assets: PendingAsset[]
  /** Same source → same asset (repeated icons are stored once). */
  assetKeys: Map<string, string>
  counts: {
    numbers: number; eyebrows: number; chrome: number; canvas: number
    frames: number; sharepoint: number; externalVideo: number; embeds: number
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}

function isEl(n: AnyNode): n is Element {
  return n.type === 'tag' || n.type === 'script' || n.type === 'style'
}

function classes(el: Element): string[] {
  return (el.attribs.class ?? '').split(/\s+/).filter(Boolean)
}

function has(el: Element, cls: string): boolean {
  return classes(el).includes(cls)
}

function text(n: AnyNode | AnyNode[]): string {
  return DomUtils.textContent(n).replace(/\s+/g, ' ').trim()
}

function attrs(el: Element, extraClass?: string): string {
  const out: string[] = []
  const vocab = componentClasses(el.attribs.class)
  const cls = [extraClass, ...vocab].filter(Boolean).join(' ')
  if (cls) out.push(`class="${escAttr(cls)}"`)
  for (const name of KEEP_ATTRS[el.name] ?? []) {
    const v = el.attribs[name]
    if (v !== undefined) out.push(`${name}="${escAttr(v)}"`)
  }
  return out.length ? ' ' + out.join(' ') : ''
}

/** Is this child just whitespace or a comment (skipped when grouping siblings)? */
function isBlank(n: AnyNode): boolean {
  return n.type === 'comment' || (n.type === 'text' && !/\S/.test((n as unknown as { data: string }).data))
}

// ── Assets ────────────────────────────────────────────────────────────────────

function addAsset(ctx: Ctx, key: string, make: (id: string) => PendingAsset): string {
  const seen = ctx.assetKeys.get(key)
  if (seen) return seen
  const id = `a${ctx.assets.length + 1}`
  ctx.assets.push(make(id))
  ctx.assetKeys.set(key, id)
  return id
}

function shorten(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** A small symbol rather than a drawing: no text, and at most 64 units across. */
function isIconSvg(el: Element): boolean {
  if (DomUtils.findOne(c => c.name === 'text', el.children, true)) return false
  const n = (v?: string) => { const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(v ?? ''); return m ? Number(m[1]) : null }
  const vb = (el.attribs.viewbox ?? el.attribs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const w = n(el.attribs.width) ?? (vb.length === 4 ? vb[2] : null)
  const h = n(el.attribs.height) ?? (vb.length === 4 ? vb[3] : null)
  if (w === null || h === null) return false
  // Explicit small rendering size wins (a 512-unit Font Awesome path drawn at 18px)
  const rw = n(el.attribs.width), rh = n(el.attribs.height)
  if (rw !== null && rh !== null) return rw <= 64 && rh <= 64
  return w <= 64 && h <= 64
}

/** The <svg>'s own source text, sliced from the page so attribute case (viewBox) survives. */
function svgSource(el: Element, ctx: Ctx): string {
  if (el.startIndex == null || el.endIndex == null) return ''
  return ctx.source.slice(el.startIndex, el.endIndex + 1)
}

function svgAsset(el: Element, ctx: Ctx, role: 'icon' | 'figure'): string {
  let src = svgSource(el, ctx)
  if (!src) return ''
  // Page rules aimed at this drawing (".figure svg text {…}") travel with it
  const css = svgPageCss(ctx.pageCss, el)
  if (css) src = src.replace(/^(<svg\b[^>]*>)/i, `$1<style>${css.replace(/<\//g, '')}</style>`)
  const titleEl = DomUtils.findOne(c => c.name === 'title', el.children, false)
  const label = (titleEl ? text(titleEl) : el.attribs['aria-label'] ?? '').trim()
  const alt = role === 'icon' ? '' : label
  const id = addAsset(ctx, `svg:${src}`, id => ({
    id, kind: 'svg', role, source: { type: 'svg', svg: src }, alt,
    ref: label ? `Inline SVG — ${shorten(label)}` : role === 'icon' ? 'Inline SVG icon' : 'Inline SVG drawing',
  }))
  const img = `<img data-nv-asset="${id}" alt="${escAttr(alt)}"${role === 'icon' ? ' class="nw-icon"' : ''}>`
  return role === 'figure' && !ctx.inFigure ? `<figure class="nw-figure">${img}</figure>` : img
}

function classifyUrl(raw: string): Exclude<AssetSource, { type: 'svg' }> | null {
  const v = raw.trim()
  if (!v) return null
  if (/^data:/i.test(v)) return { type: 'data', uri: v }
  if (/^\/\//.test(v)) return { type: 'url', url: 'https:' + v }
  if (/^https?:\/\//i.test(v)) return { type: 'url', url: v }
  if (/^\/uploads\//.test(v)) return null // already a KB upload: kept as it is
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('#')) return null // other schemes: unusable
  return { type: 'path', path: v.replace(/[?#].*$/, '') }
}

function imgAsset(el: Element, ctx: Ctx): string {
  const raw = el.attribs.src ?? el.attribs['data-src'] ?? ''
  const alt = el.attribs.alt ?? ''
  const size = ['width', 'height'].map(a => /^\d+$/.test(el.attribs[a] ?? '') ? ` ${a}="${el.attribs[a]}"` : '').join('')
  // Already on the KB: an upload, or a brand icon from the library (re-importing KB HTML)
  if (/^\/uploads\//.test(raw.trim())) return `<img src="${escAttr(raw.trim())}" alt="${escAttr(alt)}"${size}>`
  const icon = /^\/icons\/([a-z0-9-]+)\.svg$/.exec(raw.trim())
  if (icon && isArticleIcon(icon[1])) return iconHtml(icon[1])
  const source = classifyUrl(raw)
  if (!source) return ''
  const ref = source.type === 'data' ? `Embedded image${alt ? ` — ${shorten(alt)}` : ''}`
    : source.type === 'url' ? shorten(source.url, 120) : source.path
  const key = source.type === 'data' ? `data:${source.uri.slice(0, 200)}:${source.uri.length}` : `${source.type}:${ref}`
  const role = ctx.inFigure ? 'figure' : 'inline'
  const id = addAsset(ctx, key, id => ({ id, kind: 'image', role, source, ref, alt }))
  return `<img data-nv-asset="${id}" alt="${escAttr(alt)}"${size}>`
}

function videoAsset(el: Element, ctx: Ctx): string {
  const sources = [el.attribs.src, ...el.children.filter(isEl).filter(c => c.name === 'source').map(c => c.attribs.src)]
    .filter((s): s is string => !!s && !!s.trim())
  const raw = sources[0]?.trim() ?? ''
  if (!raw) return ''
  const caption = el.attribs.title ?? el.attribs['aria-label'] ?? ''
  if (isPlayableVideoUrl(raw)) return ctx.inFigure ? videoInner(raw) : videoHtml(raw, { caption })
  if (isSharePointUrl(raw)) {
    ctx.counts.sharepoint++
    return `<p><a href="${escAttr(raw)}">Watch the video</a></p>`
  }
  const source = classifyUrl(raw)
  if (!source) return ''
  if (source.type === 'url') {
    // A video on someone else's server: linked, not copied (decision 24 Nov 2026)
    ctx.counts.externalVideo++
    return `<p><a href="${escAttr(source.url)}">Watch the video</a></p>`
  }
  const ref = source.type === 'data' ? 'Embedded video' : source.path
  const id = addAsset(ctx, `${source.type}:${source.type === 'data' ? source.uri.length + source.uri.slice(0, 100) : ref}`,
    id => ({ id, kind: 'video', role: 'video', source, ref, alt: caption }))
  const tag = `<video data-nv-asset="${id}" class="nw-video" controls="controls" preload="metadata" playsinline="playsinline"></video>`
  return ctx.inFigure ? tag : `<figure class="nw-figure">${tag}</figure>`
}

function videoInner(src: string): string {
  return `<video class="nw-video" src="${escAttr(src)}" controls="controls" preload="metadata" playsinline="playsinline"></video>`
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderChildren(nodes: AnyNode[], ctx: Ctx): string {
  let out = ''
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    // Consecutive .step blocks → one numbered list
    if (isEl(n) && has(n, 'step')) {
      const items: Element[] = []
      let j = i
      for (; j < nodes.length; j++) {
        const m = nodes[j]
        if (isBlank(m)) continue
        if (isEl(m) && has(m, 'step')) items.push(m)
        else break
      }
      out += `<ol class="nw-steps">${items.map(s => `<li>${renderChildren(s.children, ctx)}</li>`).join('')}</ol>`
      i = j - 1
      continue
    }
    // Consecutive standalone .card blocks (not inside a grid) → one single-column card group
    if (isEl(n) && has(n, 'card') && !ctx.inGrid) {
      const items: Element[] = []
      let j = i
      for (; j < nodes.length; j++) {
        const m = nodes[j]
        if (isBlank(m)) continue
        if (isEl(m) && has(m, 'card')) items.push(m)
        else break
      }
      const inner = { ...ctx, inGrid: true }
      out += `<div class="nw-cards">${items.map(c => renderNode(c, inner)).join('')}</div>`
      i = j - 1
      continue
    }
    out += renderNode(n, ctx)
  }
  return out
}

/** Wraps loose inline content in <p> so a component body is always block-level. */
function asBlocks(html: string, nodes: AnyNode[]): string {
  const blocky = nodes.some(n => isEl(n) && (BLOCK.test(n.name) || (n.name === 'svg' && !isIconSvg(n))))
  return blocky || !html.trim() ? html : `<p>${html.trim()}</p>`
}

function renderNode(n: AnyNode, ctx: Ctx): string {
  if (n.type === 'text') {
    const data = (n as unknown as { data: string }).data
    return ctx.inPre ? esc(data) : esc(data.replace(/\s+/g, ' '))
  }
  if (!isEl(n)) return '' // comments, doctype, CDATA
  const el = n
  const name = el.name.toLowerCase()

  if (DROP.has(name)) {
    if (name === 'nav' || name === 'header' || name === 'footer') ctx.counts.chrome++
    return ''
  }
  if (name === 'canvas') { ctx.counts.canvas++; return '' }
  if (name === 'svg') return svgAsset(el, ctx, isIconSvg(el) ? 'icon' : 'figure')
  if (name === 'img') return imgAsset(el, ctx)
  if (name === 'video') return videoAsset(el, ctx)
  if (name === 'picture') {
    const img = DomUtils.findOne(c => c.name === 'img', el.children, true)
    return img ? imgAsset(img, ctx) : ''
  }
  if (name === 'source' || name === 'track') return ''
  if (name === 'iframe') {
    const embed = parseEmbedUrl(el.attribs.src ?? '')
    if (embed) { ctx.counts.embeds++; return embedHtml(embed, el.attribs.title) }
    ctx.counts.frames++
    return ''
  }
  if (name === 'h1') {
    if (el === ctx.titleEl) return '' // becomes the article title
    return `<h2>${renderChildren(el.children, ctx).trim()}</h2>`
  }
  if (name === 'figure') {
    const inner = renderChildren(el.children, { ...ctx, inFigure: true })
    return `<figure class="nw-figure">${inner}</figure>`
  }

  // ── Reference-page patterns (DocNav article markup) ──────────────────────────
  if (has(el, 'sec-num') || has(el, 'step-n')) { ctx.counts.numbers++; return '' }
  if (has(el, 'sec-ico')) {
    // The section icon goes inside the heading that follows (sec-head handles it)
    return ''
  }
  if (has(el, 'sec-head')) {
    const ico = el.children.find(c => isEl(c) && has(c, 'sec-ico')) as Element | undefined
    const svg = ico ? DomUtils.findOne(c => c.name === 'svg', ico.children, true) : null
    const icon = svg ? svgAsset(svg, ctx, 'icon') : ''
    const out = renderChildren(el.children, ctx)
    return icon ? out.replace(/^(\s*<h[2-6][^>]*>)/, `$1${icon}`) : out
  }
  if (has(el, 'sec-desc')) return `<p>${renderChildren(el.children, ctx).trim()}</p>`
  if (has(el, 'divider')) return '<hr>'
  if (has(el, 'disclaimer')) return `<p class="nw-fineprint">${renderChildren(el.children, ctx).trim()}</p>`
  if (name === 'p' && (has(el, 'lead') || has(el, 'lede') || has(el, 'intro') || has(el, 'standfirst'))) {
    return `<p class="nw-lead">${renderChildren(el.children, ctx).trim()}</p>`
  }

  if (has(el, 'callout')) {
    const variant: CalloutVariant =
      has(el, 'risk') || has(el, 'danger') || has(el, 'warn') || has(el, 'warning') ? 'risk'
      : has(el, 'ok') || has(el, 'success') ? 'ok'
      : has(el, 'info') || has(el, 'note') ? 'info'
      : 'tip'
    const label = el.children.find(c => isEl(c) && has(c, 'lbl'))
    const rest = el.children.filter(c => c !== label)
    const body = asBlocks(renderChildren(rest, ctx), rest)
    const cls = variant === 'tip' ? 'nw-callout' : `nw-callout nw-callout--${variant}`
    const title = label ? `<h4>${esc(text(label))}</h4>` : ''
    return `<div class="${cls}">${iconHtml(CALLOUT_ICONS[variant])}<div>${title}${body}</div></div>`
  }

  if (has(el, 'grid-2') || has(el, 'grid-3') || has(el, 'grid')) {
    const cols = has(el, 'grid-3') ? 3 : 2
    return `<div class="nw-cards nw-cards--${cols}">${renderChildren(el.children, { ...ctx, inGrid: true })}</div>`
  }

  if (has(el, 'card')) {
    const kids = el.children.filter(c => !isBlank(c))
    const heading = kids.find(c => isEl(c) && /^h[2-6]$/.test(c.name))
    let out = ''
    for (const c of kids) {
      if (isEl(c) && has(c, 'lbl')) {
        // An eyebrow above a heading is dropped; a label that is the card's only title stays
        if (heading) { ctx.counts.eyebrows++; continue }
        out += `<h4>${esc(text(c))}</h4>`
      } else if (isEl(c) && /^h[2-6]$/.test(c.name)) {
        out += `<h4>${renderChildren(c.children, ctx).trim()}</h4>`
      } else if (isEl(c) && has(c, 'card-body')) {
        out += asBlocks(renderChildren(c.children, ctx), c.children)
      } else {
        out += renderNode(c, ctx)
      }
    }
    return `<div class="nw-card">${out}</div>`
  }

  if (has(el, 'tbl-wrap')) return `<div class="nw-table">${renderChildren(el.children, { ...ctx, inTable: true })}</div>`
  if (name === 'table' && !ctx.inTable) {
    return `<div class="nw-table"><table>${renderChildren(el.children, { ...ctx, inTable: true })}</table></div>`
  }

  if (has(el, 'badge')) {
    const variant = has(el, 'legal') || has(el, 'ok') || has(el, 'success') ? ' nw-badge--ok'
      : has(el, 'action') || has(el, 'risk') || has(el, 'danger') ? ' nw-badge--risk'
      : has(el, 'info') ? ' nw-badge--info' : ''
    return `<span class="nw-badge${variant}">${esc(text(el))}</span>`
  }

  if (has(el, 'cta')) return `<div class="nw-cta">${renderChildren(el.children, { ...ctx, inCta: true })}</div>`
  if (ctx.inCta && /^h[1-6]$/.test(name)) return `<p class="nw-cta__title">${esc(text(el))}</p>`
  if (ctx.inCta && name === 'a') {
    const href = el.attribs.href ? ` href="${escAttr(el.attribs.href)}"` : ''
    return `<p><a class="nw-cta__link"${href}>${esc(text(el))}</a></p>`
  }

  // ── Generic HTML ────────────────────────────────────────────────────────────
  if (KEEP.has(name)) {
    const inner = renderChildren(el.children, name === 'pre' ? { ...ctx, inPre: true } : ctx)
    return VOID.has(name) ? `<${name}${attrs(el)}>` : `<${name}${attrs(el)}>${inner}</${name}>`
  }
  // div / span / section carrying our own vocabulary (re-importing KB HTML) stay as they are
  if ((name === 'div' || name === 'span' || name === 'p') && componentClasses(el.attribs.class).length) {
    // A callout's plain inner <div> is part of the component (icon | text column), so it stays
    const inner = componentClasses(el.attribs.class).includes('nw-callout')
      ? el.children.map(c => isEl(c) && c.name === 'div' && !componentClasses(c.attribs.class).length
        ? `<div>${renderChildren(c.children, ctx)}</div>`
        : renderNode(c, ctx)).join('')
      : renderChildren(el.children, ctx)
    return `<${name}${attrs(el)}>${inner}</${name}>`
  }
  // A plain <div> holding only text becomes a paragraph (outside tables, where cells stay as they are)
  if (name === 'div' && !ctx.inTable) return asBlocks(renderChildren(el.children, ctx), el.children)
  // Everything else (section, article, main, span, font, …) is unwrapped
  return renderChildren(el.children, ctx)
}

// ── Page CSS (for drawings and defaults) ─────────────────────────────────────

/** All <style> text in the page, with var(--x) resolved from custom properties. */
function pageStyles(doc: Document): string {
  const css = DomUtils.findAll(el => el.name === 'style', doc.children)
    .map(s => s.children.map(c => (c as unknown as { data?: string }).data ?? '').join(''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const vars = new Map<string, string>()
  for (const m of Array.from(css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g))) if (!vars.has(m[1])) vars.set(m[1], m[2].trim())
  let out = css
  for (let i = 0; i < 4 && /var\(/.test(out); i++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fb?: string) => vars.get(name) ?? fb?.trim() ?? '')
  }
  return out
}

/** Top-level rules only (rules inside @media and other at-rules are skipped). */
function topLevelRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  let depth = 0, start = 0, selStart = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === ';' && depth === 0) {
      selStart = i + 1 // after a statement at-rule (@import …; @charset …;)
    } else if (ch === '{') {
      if (depth === 0) { start = i; }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const selector = css.slice(selStart, start).trim()
        if (!selector.startsWith('@')) rules.push({ selector, body: css.slice(start + 1, i) })
        selStart = i + 1
      }
      if (depth < 0) depth = 0
    }
  }
  return rules
}

/** Page rules that style this drawing, rewritten to work inside the standalone SVG. */
function svgPageCss(css: string, svg: Element): string {
  if (!css) return ''
  const used = new Set<string>()
  const tags = new Set<string>()
  const walk = (n: AnyNode) => {
    if (!isEl(n)) return
    tags.add(n.name.toLowerCase())
    for (const c of classes(n)) used.add(c)
    n.children.forEach(walk)
  }
  walk(svg)
  const out: string[] = []
  for (const rule of topLevelRules(css)) {
    const kept: string[] = []
    for (const sel of rule.selector.split(',').map(s => s.trim()).filter(Boolean)) {
      // ".figure svg text" → "text"; ".figure svg" → "svg"
      const parts = sel.split(/\s+/)
      const svgAt = parts.findIndex(p => /^svg(?:[.#:[]|$)/i.test(p))
      if (svgAt >= 0) { kept.push(parts.slice(svgAt).join(' ')); continue }
      // A rule aimed only at classes used inside the drawing (".node-label")
      const last = parts[parts.length - 1]
      const m = /^([a-z]+)?((?:\.[\w-]+)+)$/i.exec(last)
      if (parts.length === 1 && m && (!m[1] || tags.has(m[1].toLowerCase()))
        && m[2].split('.').filter(Boolean).every(c => used.has(c))) kept.push(last)
    }
    if (kept.length) out.push(`${kept.join(',')}{${rule.body}}`)
  }
  return out.join('')
}

const FONT_SHORTHAND = /(?:^|[;{\s])font\s*:\s*[^;}]*?[\d.]+(?:px|pt|em|rem|%)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+([^;}]+)/i

/** The page's body font and text colour: what an inline drawing inherited. */
function pageDefaults(css: string): { fontFamily: string; color: string } {
  let fontFamily = ''
  let color = ''
  for (const rule of topLevelRules(css)) {
    if (!/(^|,)\s*(body|html|:root)\s*(,|$)/i.test(rule.selector)) continue
    const fam = /font-family\s*:\s*([^;}]+)/i.exec(rule.body)?.[1] ?? FONT_SHORTHAND.exec(';' + rule.body)?.[1]
    if (fam) fontFamily = fam.trim()
    const col = /(?:^|;)\s*color\s*:\s*([^;}]+)/i.exec(rule.body)?.[1]
    if (col) color = col.trim()
  }
  return { fontFamily: fontFamily || 'Raleway, system-ui, sans-serif', color: color || '#414B4C' }
}

// ── Entry points ─────────────────────────────────────────────────────────────

function first(doc: Document, test: (el: Element) => boolean): Element | null {
  return DomUtils.findOne(test, doc.children, true)
}

/** Picks the element that holds the article body. */
function findRoot(doc: Document): Element | Document {
  return first(doc, el => has(el, 'page-body'))
    ?? first(doc, el => el.name === 'main')
    ?? first(doc, el => el.name === 'article')
    ?? first(doc, el => el.name === 'body')
    ?? doc
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// Block-level tags: source whitespace next to them is layout noise, never content.
const BLOCK_TAG = '<\\/?(?:p|h[2-6]|ul|ol|li|dl|dt|dd|div|table|thead|tbody|tfoot|tr|td|th|caption|blockquote|figure|figcaption|hr)(?:\\s[^>]*)?>'
const SPACE_AFTER_BLOCK = new RegExp(`(${BLOCK_TAG})\\s+`, 'g')
const SPACE_BEFORE_BLOCK = new RegExp(`\\s+(${BLOCK_TAG})`, 'g')

/** Tidies the serialised output: no whitespace around block tags, no empty paragraphs.
 *  (TinyMCE formats the source view itself.) Runs before <pre> could be affected: pre
 *  content only ever touches pre/code tags, which are not in BLOCK_TAG. */
function tidy(html: string): string {
  return html
    .replace(SPACE_AFTER_BLOCK, '$1')
    .replace(SPACE_BEFORE_BLOCK, '$1')
    .replace(/<p>\s*<\/p>/g, '')
    .trim()
}

function pageTags(doc: Document): string[] {
  const out: string[] = []
  const add = (t: string) => {
    const v = t.replace(/\s+/g, ' ').trim()
    if (v && v.length <= 60 && !out.some(o => o.toLowerCase() === v.toLowerCase())) out.push(v)
  }
  for (const el of DomUtils.findAll(e => has(e, 'tag') || has(e, 'chip') && !!e.parent && isEl(e.parent) && has(e.parent, 'tags'), doc.children)) add(text(el))
  for (const el of DomUtils.findAll(e => e.name === 'meta', doc.children)) {
    const n = (el.attribs.name ?? el.attribs.property ?? '').toLowerCase()
    if (n === 'keywords') (el.attribs.content ?? '').split(',').forEach(add)
    if (n === 'article:tag') add(el.attribs.content ?? '')
  }
  return out.slice(0, 12)
}

/** Stage 1: converts the page and collects its assets (no I/O). */
export function convertArticleHtml(source: string): ConvertResult {
  const doc = parseDocument(source, {
    decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true,
    withStartIndices: true, withEndIndices: true,
  })

  const h1 = first(doc, el => el.name === 'h1')
  const titleTag = first(doc, el => el.name === 'title')
  const title = (h1 ? text(h1) : '') || (titleTag ? text(titleTag).split(/\s+[|–—-]\s+/)[0] : '')

  const metaDesc = first(doc, el => el.name === 'meta' && (el.attribs.name ?? '').toLowerCase() === 'description')
  const subtitle = first(doc, el => has(el, 'subtitle') || has(el, 'lede') || has(el, 'lead') || has(el, 'hero__copy'))
  const description = (metaDesc?.attribs.content ?? '').replace(/\s+/g, ' ').trim() || (subtitle ? text(subtitle) : '')

  const pageCss = pageStyles(doc)
  const ctx: Ctx = {
    source, inGrid: false, inTable: false, inCta: false, inPre: false, inFigure: false, titleEl: h1,
    pageCss, defaults: pageDefaults(pageCss), assets: [], assetKeys: new Map(),
    counts: { numbers: 0, eyebrows: 0, chrome: 0, canvas: 0, frames: 0, sharepoint: 0, externalVideo: 0, embeds: 0 },
  }
  const root = findRoot(doc)
  const html = tidy(renderChildren(root.children, ctx))

  const notes: string[] = []
  const c = ctx.counts
  if (c.numbers) notes.push(`${plural(c.numbers, 'section or step number was', 'section and step numbers were')} removed; headings and numbered steps carry the order.`)
  if (c.eyebrows) notes.push(`${plural(c.eyebrows, 'label above a card heading was', 'labels above card headings were')} removed.`)
  if (c.chrome) notes.push('The page’s own navigation, header and footer were left out.')
  if (c.embeds) notes.push(`${plural(c.embeds, 'video or Scribe embed was', 'video or Scribe embeds were')} kept.`)
  if (c.canvas) notes.push(`${plural(c.canvas, 'chart drawn with JavaScript (canvas) could not', 'charts drawn with JavaScript (canvas) could not')} be imported. Export ${c.canvas === 1 ? 'it' : 'them'} as an image or SVG and add ${c.canvas === 1 ? 'it' : 'them'} from the Assets panel.`)
  if (c.frames) notes.push(`${plural(c.frames, 'embedded frame was', 'embedded frames were')} removed. Only YouTube, Vimeo and Scribe embeds are supported.`)
  if (c.sharepoint) notes.push(`${plural(c.sharepoint, 'SharePoint video is', 'SharePoint videos are')} linked, not played: they only open for people signed in to Nuvho’s Microsoft 365. Use an MP4 on sftp.nuvho.com, an upload, YouTube or Vimeo to play it in the article.`)
  if (c.externalVideo) notes.push(`${plural(c.externalVideo, 'video on another website is', 'videos on other websites are')} linked, not played. Upload the MP4 or put it on sftp.nuvho.com/publicdownloads to play it in the article.`)
  if (!html) notes.push('No article content was found in that HTML.')

  return { title, description, tags: pageTags(doc), html, assets: ctx.assets, svgDefaults: ctx.defaults, notes }
}

/** Removes figures left with nothing but a caption (an asset that could not be stored).
 *  A figure with any other content — a "Watch the video" link, a quote, text — is kept. */
function dropEmptyFigures(html: string): string {
  return html.replace(/<figure\b[^>]*>((?:(?!<\/?figure\b)[\s\S])*)<\/figure>/g, (whole, inner: string) => {
    const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(inner)?.[1]
    const rest = inner.replace(/<figcaption>[\s\S]*?<\/figcaption>/, '').replace(/<p>\s*<\/p>/g, '').trim()
    if (rest) return whole
    return cap?.trim() ? `<p class="nw-fineprint">${cap}</p>` : ''
  })
}

/**
 * Stage 2 helper: swaps data-nv-asset placeholders for stored URLs, drops the ones that
 * could not be stored (null / missing), and sanitises. Returns '' when nothing is left.
 */
export function resolveAssetPlaceholders(html: string, urls: Record<string, { src: string; width?: number; height?: number } | null>): string {
  const out = html.replace(/<(img|video)\b([^>]*?)\sdata-nv-asset="(a\d+)"([^>]*)>(<\/video>)?/g,
    (_whole, tag: string, before: string, id: string, after: string, close?: string) => {
      const hit = urls[id]
      if (!hit) return ''
      const size = tag === 'img' && hit.width && hit.height && !/\swidth=/.test(before + after)
        ? ` width="${hit.width}" height="${hit.height}"` : ''
      return `<${tag} src="${escAttr(hit.src)}"${before}${after}${size}>${close ?? ''}`
    })
  return sanitizeArticleHtml(tidy(dropEmptyFigures(out).replace(/<p>\s*<\/p>/g, ''))) ?? ''
}

/** Converts without storing assets (tests, previews): assets are dropped and reported. */
export function importArticleHtml(source: string): ImportResult {
  const r = convertArticleHtml(source)
  const html = r.html ? resolveAssetPlaceholders(r.html, {}) : ''
  const notes = [...r.notes]
  if (r.assets.length) {
    notes.unshift(`${plural(r.assets.length, 'asset (image, drawing or video) was', 'assets (images, drawings or videos) were')} not stored: import through the editor or the KB import API to keep ${r.assets.length === 1 ? 'it' : 'them'}.`)
  }
  if (!html && !notes.includes('No article content was found in that HTML.')) notes.push('No article content was found in that HTML.')
  return { title: r.title, description: r.description, tags: r.tags, html, notes }
}

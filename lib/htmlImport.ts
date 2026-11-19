import { parseDocument, DomUtils } from 'htmlparser2'
import type { AnyNode, Element, Document } from 'domhandler'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { CALLOUT_ICONS, componentClasses, iconHtml, type CalloutVariant } from '@/lib/articleComponents'

// "Import HTML" (decision 17 Nov 2026): turns a standalone rich HTML page — the reference is
// Nuvho_Hotel_Brand_Protection_v1.0.0.html, a DocNav page with cards, callouts, steps,
// badge tables and an icon per section — into ordinary article HTML that uses the
// component vocabulary in lib/articleComponents.ts. The author reviews the result in the
// editor before saving, and the save path sanitises it again (lib/sanitize.ts).
//
// What is kept: the article body, its headings, text, lists, tables, links, code, images
// with a real URL, and every recognised component. What goes: the page's own chrome
// (sidebar, header, footer, scripts, styles, embedded fonts, logos), inline SVG, data: URI
// images, section numbers and eyebrow labels above card headings. The first <h1> becomes the
// article title (later ones become <h2> sections) and the subtitle / meta description the
// article description.
//
// Two callers, one converter: the editor's Import menu (POST /api/admin/import-html), and the
// nuvho-knowledge-save skill's HTML mode, which runs a bundled copy of this file (with the
// sanitiser) built by scripts/build-skill-importer.mjs. Rebuild that bundle and ship a new
// skill version whenever this file, lib/articleComponents.ts or lib/sanitize.ts changes.
//
// Written as a pure tree → string render (no DOM mutation) so it runs on the server and in
// tests. htmlparser2 is the version sanitize-html already uses (8.x, CommonJS — see the
// version note in lib/sanitize.ts).

export interface ImportResult {
  title: string
  description: string
  html: string
  /** Plain-language notes on what was changed or dropped, for the author. */
  notes: string[]
}

/** Elements removed with everything inside them. */
const DROP = new Set([
  'script', 'style', 'link', 'meta', 'noscript', 'template', 'title', 'head',
  'nav', 'header', 'footer', 'form', 'button', 'input', 'select', 'textarea', 'label',
  'iframe', 'object', 'embed', 'canvas', 'video', 'audio', 'source', 'picture', 'svg', 'math',
])

/** Elements copied through as themselves (attributes filtered by KEEP_ATTRS). */
const KEEP = new Set([
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'code', 'kbd', 'pre',
  'a', 'ul', 'ol', 'li', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'img', 'figure', 'figcaption', 'dl', 'dt', 'dd',
])

const VOID = new Set(['br', 'hr', 'img', 'col'])

const KEEP_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target'],
  img: ['src', 'alt', 'width', 'height'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  ol: ['start'],
  col: ['span'],
  h2: ['id'],
  h3: ['id'],
}

const BLOCK = /^(p|h[1-6]|ul|ol|dl|table|blockquote|pre|figure|div|hr)$/

interface Ctx {
  inGrid: boolean
  inTable: boolean
  inCta: boolean
  inPre: boolean
  /** The first <h1> (the article title): dropped. Any later <h1> becomes an <h2> section. */
  titleEl: Element | null
  counts:{ icons: number; dataImages: number; numbers: number; eyebrows: number; chrome: number }
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
  const blocky = nodes.some(n => isEl(n) && BLOCK.test(n.name))
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
    if (name === 'svg') ctx.counts.icons++
    else if (name === 'nav' || name === 'header' || name === 'footer') ctx.counts.chrome++
    return ''
  }
  if (name === 'h1') {
    if (el === ctx.titleEl) return '' // becomes the article title
    return `<h2>${renderChildren(el.children, ctx).trim()}</h2>`
  }

  // ── Reference-page patterns (DocNav article markup) ──────────────────────────
  if (has(el, 'sec-num') || has(el, 'step-n')) { ctx.counts.numbers++; return '' }
  if (has(el, 'sec-ico')) { ctx.counts.icons++; return '' }
  if (has(el, 'sec-head')) return renderChildren(el.children, ctx)
  if (has(el, 'sec-desc')) return `<p>${renderChildren(el.children, ctx).trim()}</p>`
  if (has(el, 'divider')) return '<hr>'
  if (has(el, 'disclaimer')) return `<p class="nw-fineprint">${renderChildren(el.children, ctx).trim()}</p>`

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

  // ── Images: data: URIs cannot be stored (uploads go through the editor) ─────────
  if (name === 'img') {
    const src = el.attribs.src ?? ''
    if (!src || /^data:/i.test(src)) { ctx.counts.dataImages++; return '' }
    return `<img${attrs(el)}>`
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

export function importArticleHtml(source: string): ImportResult {
  const doc = parseDocument(source, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true })

  const h1 = first(doc, el => el.name === 'h1')
  const titleTag = first(doc, el => el.name === 'title')
  const title = (h1 ? text(h1) : '') || (titleTag ? text(titleTag).split(/\s+[|–—-]\s+/)[0] : '')

  const metaDesc = first(doc, el => el.name === 'meta' && (el.attribs.name ?? '').toLowerCase() === 'description')
  const subtitle = first(doc, el => has(el, 'subtitle') || has(el, 'lede') || has(el, 'lead'))
  const description = (metaDesc?.attribs.content ?? '').replace(/\s+/g, ' ').trim() || (subtitle ? text(subtitle) : '')

  const ctx: Ctx = {
    inGrid: false, inTable: false, inCta: false, inPre: false, titleEl: h1,
    counts: { icons: 0, dataImages: 0, numbers: 0, eyebrows: 0, chrome: 0 },
  }
  const root = findRoot(doc)
  const html = sanitizeArticleHtml(tidy(renderChildren(root.children, ctx))) ?? ''

  const notes: string[] = []
  const c = ctx.counts
  if (c.icons) notes.push(`${plural(c.icons, 'inline SVG icon was', 'inline SVG icons were')} removed. Add brand icons from Components → Icon.`)
  if (c.dataImages) notes.push(`${plural(c.dataImages, 'embedded image was', 'embedded images were')} removed. Upload them with the image button.`)
  if (c.numbers) notes.push(`${plural(c.numbers, 'section or step number was', 'section and step numbers were')} removed; headings and numbered steps carry the order.`)
  if (c.eyebrows) notes.push(`${plural(c.eyebrows, 'label above a card heading was', 'labels above card headings were')} removed.`)
  if (c.chrome) notes.push('The page’s own navigation, header and footer were left out.')
  if (!html) notes.push('No article content was found in that HTML.')

  return { title, description, html, notes }
}

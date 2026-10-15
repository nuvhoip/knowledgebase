// Table of contents for the article page (Jude, IT Catchup 13 Oct 2026): GitBook-style
// links built from the article's own headings. Runs at render time on the stored article
// HTML and only changes the copy sent to the reader — ids (and tabindex="-1", so a TOC
// jump can move keyboard focus) are added there. The stored content is never rewritten,
// so the editor and the vector DB sync see exactly what they did before.
//
// The editor offers H2–H4 and lib/sanitize.ts strips H1, so the page title in the hero is
// the article's only H1; the outline is built from H2 and H3 underneath it.
//
// The input is sanitize-html output (well-formed, no scripts), which is why plain regexes
// are enough here and no HTML parser is pulled into the page bundle.

export interface TocEntry {
  id: string
  text: string
  level: number
  children: TocEntry[]
}

export interface TocResult {
  /** The article HTML with ids on every outlined heading. */
  html: string
  /** Nested outline (H3 under the H2 before it). */
  entries: TocEntry[]
  /** Number of outlined headings at every level. */
  count: number
}

/** Heading levels that appear in the outline. */
export const TOC_LEVELS = [2, 3]

/** Fewer outlined headings than this and the article has nothing to navigate (Q2). */
export const TOC_MIN_ENTRIES = 2

const HEADING = /<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1\s*>/gi
const OPEN_TAG = /<[a-z][a-z0-9]*(\s[^>]*)?>/gi
const ID_ATTR = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function readId(attrs: string): string | null {
  const m = ID_ATTR.exec(attrs)
  if (!m) return null
  const id = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim()
  return id || null
}

/** Visible text of a heading's inner HTML: tags dropped, entities decoded, whitespace collapsed. */
export function headingText(innerHtml: string): string {
  // Inline tags vanish (so "<a>Step 1</a>:" stays "Step 1:"); a line break reads as a space.
  const text = innerHtml.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}

/** URL-safe slug for a heading id: lower-case ASCII letters, digits and single hyphens. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
  return slug || 'section'
}

/** `base`, or `base-2`, `base-3`, … — the first one not already in `used`. */
export function uniqueId(base: string, used: { has(id: string): boolean }): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Nests a flat heading list: each entry goes under the nearest earlier entry of a higher level. */
export function nestEntries(flat: Omit<TocEntry, 'children'>[]): TocEntry[] {
  const root: TocEntry[] = []
  const stack: TocEntry[] = []
  for (const item of flat) {
    const entry: TocEntry = { ...item, children: [] }
    while (stack.length && stack[stack.length - 1].level >= entry.level) stack.pop()
    ;(stack.length ? stack[stack.length - 1].children : root).push(entry)
    stack.push(entry)
  }
  return root
}

export function buildToc(html: string, levels: number[] = TOC_LEVELS): TocResult {
  // Every id already in the document (TinyMCE anchors, hand-written ids) is reserved, so a
  // generated heading id can never collide with an existing in-page link target.
  // (exec loop rather than matchAll: tsconfig targets ES5, which has no iterators)
  const reserved = new Set<string>()
  OPEN_TAG.lastIndex = 0
  for (let tag = OPEN_TAG.exec(html); tag; tag = OPEN_TAG.exec(html)) {
    const id = tag[1] ? readId(tag[1]) : null
    if (id) reserved.add(id)
  }

  const assigned = new Set<string>()
  const taken = { has: (id: string) => reserved.has(id) || assigned.has(id) }
  const flat: Omit<TocEntry, 'children'>[] = []

  const out = html.replace(HEADING, (match, lvl: string, attrs: string | undefined, inner: string) => {
    const level = Number(lvl)
    if (!levels.includes(level)) return match
    const text = headingText(inner)
    if (!text) return match // empty heading (e.g. <h2><br></h2>) — nothing to link to

    const attrString = attrs ?? ''
    const existing = readId(attrString)
    let id: string
    let rest: string
    if (existing && !assigned.has(existing)) {
      // Keep the author's id so links people already share keep working
      id = existing
      rest = attrString.replace(ID_ATTR, '')
    } else {
      id = uniqueId(slugify(text), taken)
      rest = existing ? attrString.replace(ID_ATTR, '') : attrString
    }
    assigned.add(id)
    flat.push({ id, text, level })

    const tabindex = /\stabindex\s*=/i.test(rest) ? '' : ' tabindex="-1"'
    return `<h${level} id="${escapeAttr(id)}"${tabindex}${rest}>${inner}</h${level}>`
  })

  return { html: out, entries: nestEntries(flat), count: flat.length }
}

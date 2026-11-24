import { readFile } from 'fs/promises'
import path from 'path'
import { parseDocument } from 'htmlparser2'
import type { AnyNode, Element } from 'domhandler'

// Brand fonts inside imported SVG diagrams (decision 24 Nov 2026: "SVG with Comfortaa and
// Raleway embedded as subsets").
//
// An SVG shown through <img> cannot load web fonts from the page, so text set in Raleway or
// Comfortaa would fall back to a system font. For every family / weight / style the drawing
// actually uses, this cuts the KB's own variable font (app/fonts) down to just the
// characters drawn, pins the weight, converts it to WOFF2 and embeds it as a data: URL in an
// @font-face rule. A typical diagram adds 5–20 KB per weight.
//
// Text styling is followed through attributes, style="" and simple <style> rules (tag, .class
// and tag.class selectors, including the font shorthand). Families other than Comfortaa and
// Raleway are left to the reader's system fonts.

export interface FontFace {
  family: 'Comfortaa' | 'Raleway'
  weight: number
  style: 'normal' | 'italic'
}

interface FontFile { file: string; min: number; max: number }

const FONT_FILES: Record<string, FontFile> = {
  'Comfortaa|normal': { file: 'Comfortaa-VariableFont_wght.ttf', min: 300, max: 700 },
  'Comfortaa|italic': { file: 'Comfortaa-VariableFont_wght.ttf', min: 300, max: 700 }, // no italic cut: synthesised
  'Raleway|normal':   { file: 'Raleway-VariableFont_wght.ttf', min: 100, max: 900 },
  'Raleway|italic':   { file: 'Raleway-Italic-VariableFont_wght.ttf', min: 100, max: 900 },
}

const FAMILIES: Record<string, FontFace['family']> = { comfortaa: 'Comfortaa', raleway: 'Raleway' }

interface Props { family: string | null; weight: string | null; style: string | null }

function isEl(n: AnyNode): n is Element {
  return n.type === 'tag' || n.type === 'script' || n.type === 'style'
}

/** First family in a font-family list that we can embed. */
export function brandFamily(list: string | null): FontFace['family'] | null {
  if (!list) return null
  for (const raw of list.split(',')) {
    const name = raw.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    if (FAMILIES[name]) return FAMILIES[name]
  }
  return null
}

export function weightOf(v: string | null): number {
  if (!v) return 400
  const t = v.trim().toLowerCase()
  if (t === 'bold' || t === 'bolder') return 700
  if (t === 'lighter') return 300
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 400
}

/** font: [style] [variant] [weight] size[/line-height] family-list */
export function parseFontShorthand(v: string): Partial<Props> {
  const m = /^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|\d{3})\s+)*)[\d.]+(?:px|pt|em|rem|%)(?:\s*\/\s*[\d.]+(?:px|em|rem|%)?)?\s+(.+)$/i.exec(v)
  if (!m) return {}
  const words = m[1].trim().toLowerCase().split(/\s+/).filter(Boolean)
  const out: Partial<Props> = { family: m[2].trim() }
  for (const w of words) {
    if (w === 'italic' || w === 'oblique') out.style = 'italic'
    else if (/^(?:bold|bolder|lighter|\d{3})$/.test(w)) out.weight = w
  }
  return out
}

function declarations(css: string): Partial<Props> {
  const out: Partial<Props> = {}
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim().toLowerCase()
    const v = decl.slice(i + 1).replace(/!important/i, '').trim()
    if (k === 'font') Object.assign(out, parseFontShorthand(v))
    else if (k === 'font-family') out.family = v
    else if (k === 'font-weight') out.weight = v
    else if (k === 'font-style') out.style = v
  }
  return out
}

interface Rule { tag: string | null; cls: string | null; props: Partial<Props> }

/** Simple rules only: `text`, `.label`, `text.label`, comma lists. Anything else is ignored. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const props = declarations(m[2])
    if (!Object.keys(props).length) continue
    for (const sel of m[1].split(',')) {
      const s = sel.trim().split(/\s+/).pop() ?? '' // descendant selectors: match on the last part
      const mm = /^([a-zA-Z][\w-]*|\*)?(?:\.([\w-]+))?$/.exec(s)
      if (!mm || (!mm[1] && !mm[2])) continue
      rules.push({ tag: mm[1] && mm[1] !== '*' ? mm[1] : null, cls: mm[2] ?? null, props })
    }
  }
  return rules
}

/** Which brand faces the drawing uses, and the characters set in each. */
export function collectFaces(svg: string): Map<string, { face: FontFace; chars: Set<string> }> {
  const doc = parseDocument(svg, { xmlMode: true, decodeEntities: true })
  const rules: Rule[] = []
  const visitStyles = (n: AnyNode) => {
    if (!isEl(n)) return
    if (n.name === 'style') rules.push(...parseRules(n.children.map(c => (c as unknown as { data?: string }).data ?? '').join('')))
    n.children.forEach(visitStyles)
  }
  doc.children.forEach(visitStyles)

  const faces = new Map<string, { face: FontFace; chars: Set<string> }>()
  const walk = (n: AnyNode, inherited: Props) => {
    if (n.type === 'text') {
      const family = brandFamily(inherited.family)
      const text = (n as unknown as { data: string }).data
      if (!family || !text.trim()) return
      const face: FontFace = {
        family,
        weight: weightOf(inherited.weight),
        style: /italic|oblique/i.test(inherited.style ?? '') ? 'italic' : 'normal',
      }
      const key = `${face.family}|${face.style}|${face.weight}`
      const entry = faces.get(key) ?? { face, chars: new Set<string>() }
      for (const ch of text) entry.chars.add(ch)
      faces.set(key, entry)
      return
    }
    if (!isEl(n) || n.name === 'style' || n.name === 'title' || n.name === 'desc') return
    const props: Props = { ...inherited }
    const classes = (n.attribs.class ?? '').split(/\s+/).filter(Boolean)
    for (const r of rules) {
      if ((r.tag && r.tag !== n.name) || (r.cls && !classes.includes(r.cls))) continue
      Object.assign(props, r.props)
    }
    if (n.attribs['font-family']) props.family = n.attribs['font-family']
    if (n.attribs['font-weight']) props.weight = n.attribs['font-weight']
    if (n.attribs['font-style']) props.style = n.attribs['font-style']
    if (n.attribs.style) Object.assign(props, declarations(n.attribs.style))
    n.children.forEach(c => walk(c, props))
  }
  doc.children.forEach(c => walk(c, { family: null, weight: null, style: null }))
  return faces
}

// ── Subsetting ──────────────────────────────────────────────────────────────

const fontCache = new Map<string, Promise<Buffer>>()

function fontDir(): string {
  return process.env.KB_FONT_DIR || path.join(process.cwd(), 'app', 'fonts')
}

function loadFont(file: string): Promise<Buffer> {
  let p = fontCache.get(file)
  if (!p) {
    p = readFile(path.join(fontDir(), file))
    p.catch(() => fontCache.delete(file))
    fontCache.set(file, p)
  }
  return p
}

type SubsetFn = (font: Buffer, text: string, opts: { targetFormat: 'woff2'; variationAxes?: Record<string, number> }) => Promise<Buffer>

async function subsetter(): Promise<SubsetFn> {
  // subset-font is CommonJS and loads harfbuzz as WebAssembly: server only, loaded on first use
  const mod = await import('subset-font')
  return ((mod as unknown as { default?: SubsetFn }).default ?? (mod as unknown as SubsetFn))
}

export interface EmbedResult {
  svg: string
  faces: FontFace[]
  /** Faces that could not be embedded (missing font file, subsetting failure). */
  failed: FontFace[]
  addedBytes: number
}

/** Embeds subsets of the brand fonts the drawing uses. Never throws: on failure the SVG is returned unchanged. */
export async function embedBrandFonts(svg: string): Promise<EmbedResult> {
  const faces = Array.from(collectFaces(svg).values())
  if (!faces.length) return { svg, faces: [], failed: [], addedBytes: 0 }

  const rules: string[] = []
  const done: FontFace[] = []
  const failed: FontFace[] = []
  let subset: SubsetFn
  try {
    subset = await subsetter()
  } catch (err) {
    console.error('[svgFonts] subset-font unavailable', err)
    return { svg, faces: [], failed: faces.map(f => f.face), addedBytes: 0 }
  }

  for (const { face, chars } of faces) {
    const def = FONT_FILES[`${face.family}|${face.style}`]
    try {
      const font = await loadFont(def.file)
      const weight = Math.min(def.max, Math.max(def.min, face.weight))
      const text = Array.from(chars).join('') + ' '
      const woff2 = await subset(font, text, { targetFormat: 'woff2', variationAxes: { wght: weight } })
      rules.push(
        `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};`
        + `src:url(data:font/woff2;base64,${woff2.toString('base64')}) format("woff2")}`,
      )
      done.push(face)
    } catch (err) {
      console.error('[svgFonts] could not embed', face, err)
      failed.push(face)
    }
  }
  if (!rules.length) return { svg, faces: [], failed, addedBytes: 0 }

  const style = `<style>${rules.join('')}</style>`
  // Insert as the root's first child
  const out = svg.replace(/^(<svg\b[^>]*>)/, `$1${style}`)
  return { svg: out, faces: done, failed, addedBytes: Buffer.byteLength(style, 'utf8') }
}

import { parseDocument } from 'htmlparser2'
import type { AnyNode, Element } from 'domhandler'

// Inline SVG diagrams → standalone, safe .svg files (decision 24 Nov 2026, NUVCL-201).
//
// Claude documents draw their diagrams and charts as inline <svg>. The importer lifts each
// one out of the page, cleans it here, stores it as /uploads/<id>.svg and puts an <img> where
// it was. An SVG in an <img> never runs scripts, but the same file opened directly would, so
// this is a strict allow-list: static shapes, text, gradients, clip paths, masks, markers and
// simple filters. No scripts, event handlers, <foreignObject>, animation, external
// references or links. The file is also served with a locked-down CSP (app/uploads route).
//
// Parsed in XML mode so attribute case survives (viewBox, gradientUnits …). Pure: no I/O,
// so it runs in tests. Fonts are embedded afterwards by lib/svgFonts.ts.

export interface CleanSvg {
  /** The standalone SVG document text (xmlns set, intrinsic width/height set). */
  svg: string
  width: number
  height: number
  /** From <title>, aria-label or <desc>: becomes the <img> alt text. */
  title: string
  desc: string
  /** Number of elements dropped by the allow-list (scripts, foreignObject, …). */
  dropped: number
}

export const MAX_SVG_BYTES = 2 * 1024 * 1024
const MAX_ELEMENTS = 20000

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker', 'image',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood',
  'feMerge', 'feMergeNode', 'feDropShadow', 'feMorphology', 'feComponentTransfer',
  'feFuncR', 'feFuncG', 'feFuncB', 'feFuncA',
])

/** Elements whose content is kept but the element itself is not (a link → its children). */
const UNWRAP = new Set(['a', 'switch'])

const ATTR = new RegExp('^(?:' + [
  'id', 'class', 'style', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden', 'lang', 'xml:space', 'xml:lang',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'width', 'height',
  'viewBox', 'preserveAspectRatio', 'transform', 'pathLength',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-[a-z]+', 'opacity', 'color', 'display', 'visibility', 'overflow',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch',
  'text-anchor', 'dominant-baseline', 'alignment-baseline', 'baseline-shift', 'letter-spacing', 'word-spacing',
  'text-decoration', 'writing-mode', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust', 'startOffset', 'method', 'spacing', 'side',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod',
  'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits',
  'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
  'patternUnits', 'patternContentUnits', 'patternTransform',
  'filter', 'filterUnits', 'primitiveUnits', 'in', 'in2', 'result', 'stdDeviation', 'mode', 'operator',
  'k1', 'k2', 'k3', 'k4', 'values', 'type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent',
  'flood-color', 'flood-opacity', 'radius', 'vector-effect', 'shape-rendering', 'text-rendering', 'paint-order',
  'mix-blend-mode', 'isolation', 'href', 'xlink:href', 'version',
].join('|') + ')$')

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i

function isEl(n: AnyNode): n is Element {
  return n.type === 'tag' || n.type === 'script' || n.type === 'style'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}

/** CSS inside style="" or <style>: no imports, no external url(), no legacy script hooks. */
export function cleanCss(css: string): string {
  return css
    // CSS escapes (u\72l(, @\69mport) would hide what follows from the checks below
    .replace(/\\([0-9a-f]{1,6}\s?|[^\n0-9a-f])/gi, (_m, e: string) => /^[0-9a-f]/i.test(e) ? String.fromCodePoint(parseInt(e, 16) || 0xfffd) : e)
    .replace(/<\/?[a-z][^>]*>/gi, '')                       // never let markup through
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')  // only url(#local-id)
    .replace(/expression\s*\(|behaviou?r\s*:|-moz-binding|javascript:/gi, '')
}

/** Only a local reference (#id) survives, except a data: image on <image>. */
function cleanValue(el: string, name: string, value: string): string | null {
  const v = value.trim()
  if (/javascript:|vbscript:|data:text|data:application/i.test(v)) return null
  if (name === 'href' || name === 'xlink:href') {
    if (v.startsWith('#')) return v
    if (el === 'image' && DATA_IMAGE.test(v)) return v.replace(/\s+/g, '')
    return null
  }
  if (name === 'style') return cleanCss(v)
  // url() references in presentation attributes must be local (fill="url(#grad)")
  if (/url\(/i.test(v) && !/^url\(\s*['"]?#[^)]*\)$/i.test(v.replace(/\s+none$/i, ''))) return null
  return v
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(v)
  return m ? Number(m[1]) : null
}

function textOf(n: AnyNode): string {
  if (n.type === 'text') return (n as unknown as { data: string }).data
  if (isEl(n)) return n.children.map(textOf).join('')
  return ''
}

interface Ctx { dropped: number; elements: number; usesXlink: boolean }

function render(n: AnyNode, ctx: Ctx, inStyle = false): string {
  if (n.type === 'text') {
    const data = (n as unknown as { data: string }).data
    return inStyle ? esc(cleanCss(data)) : esc(data)
  }
  if (n.type === 'cdata') return n.children.map(c => render(c, ctx, inStyle)).join('')
  if (!isEl(n)) return '' // comments, processing instructions
  if (++ctx.elements > MAX_ELEMENTS) return ''
  const name = n.name
  if (UNWRAP.has(name)) return n.children.map(c => render(c, ctx)).join('')
  if (!ELEMENTS.has(name)) { ctx.dropped++; return '' }

  const attrs: string[] = []
  for (const [rawName, rawValue] of Object.entries(n.attribs)) {
    const an = rawName
    if (an.startsWith('on') || !ATTR.test(an)) continue
    if (an === 'xmlns' || an.startsWith('xmlns:')) continue // set on the root only
    const v = cleanValue(name, an, rawValue)
    if (v === null) continue
    if (an === 'xlink:href') ctx.usesXlink = true
    attrs.push(`${an}="${escAttr(v)}"`)
  }
  // <image> without a usable source draws nothing: drop it rather than keep a dead reference
  if (name === 'image' && !attrs.some(a => /^(?:xlink:)?href=/.test(a))) { ctx.dropped++; return '' }

  const inner = n.children.map(c => render(c, ctx, name === 'style')).join('')
  return `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${inner ? `>${inner}</${name}>` : '/>'}`
}

export interface CleanSvgOptions {
  /** Font family to set on the root when the drawing names none (it inherited the page's). */
  defaultFontFamily?: string
  /** Colour for currentColor when the drawing inherited it from the page. */
  defaultColor?: string
}

/** Cleans one <svg> element's source text. Returns null when there is nothing drawable. */
export function cleanSvg(source: string, opts: CleanSvgOptions = {}): CleanSvg | null {
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_SVG_BYTES) return null
  const doc = parseDocument(source, { xmlMode: true, decodeEntities: true })
  const root = doc.children.find(c => isEl(c) && c.name.toLowerCase() === 'svg') as Element | undefined
  if (!root) return null

  const kids = root.children.filter(isEl)
  const titleEl = kids.find(c => c.name === 'title')
  const descEl = kids.find(c => c.name === 'desc')
  const title = (titleEl ? textOf(titleEl) : root.attribs['aria-label'] ?? '').replace(/\s+/g, ' ').trim()
  const desc = (descEl ? textOf(descEl) : '').replace(/\s+/g, ' ').trim()

  // Intrinsic size: an <img> needs one. viewBox first, then numeric width/height.
  const vb = (root.attribs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0
  let width = num(root.attribs.width) ?? (hasVb ? vb[2] : null)
  let height = num(root.attribs.height) ?? (hasVb ? vb[3] : null)
  if (width && !height && hasVb) height = Math.round((width * vb[3]) / vb[2])
  if (height && !width && hasVb) width = Math.round((height * vb[2]) / vb[3])
  if (!width || !height) { width = 300; height = 150 }
  width = Math.round(width)
  height = Math.round(height)

  const ctx: Ctx = { dropped: 0, elements: 0, usesXlink: false }
  // Render the root's children, then rebuild the root tag with the attributes it must have
  const inner = root.children.map(c => render(c, ctx)).join('')
  if (!inner.trim()) return null

  const rootAttrs: Record<string, string> = {}
  for (const [k, v] of Object.entries(root.attribs)) {
    if (k.startsWith('on') || !ATTR.test(k) || k === 'width' || k === 'height' || k === 'style' || k === 'class') continue
    const c = cleanValue('svg', k, v)
    if (c !== null) rootAttrs[k] = c
  }
  // The root's style may carry the font and colour: keep the safe part of it
  const rootStyle = root.attribs.style ? cleanCss(root.attribs.style) : ''
  if (!hasVb) rootAttrs.viewBox = `0 0 ${width} ${height}`
  if (!rootAttrs['font-family'] && !/font-family\s*:/i.test(rootStyle) && opts.defaultFontFamily) {
    rootAttrs['font-family'] = opts.defaultFontFamily
  }
  if (!rootAttrs.color && opts.defaultColor && /currentColor/i.test(inner)) rootAttrs.color = opts.defaultColor

  const attrText = [
    `xmlns="${SVG_NS}"`,
    ctx.usesXlink ? `xmlns:xlink="${XLINK_NS}"` : '',
    `width="${width}"`, `height="${height}"`,
    ...Object.entries(rootAttrs).map(([k, v]) => `${k}="${escAttr(v)}"`),
    rootStyle ? `style="${escAttr(rootStyle)}"` : '',
  ].filter(Boolean).join(' ')

  const svg = `<svg ${attrText}>${inner}</svg>`
  return { svg, width, height, title, desc, dropped: ctx.dropped }
}

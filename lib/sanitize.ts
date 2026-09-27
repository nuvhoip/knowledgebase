import sanitizeHtml from 'sanitize-html'

// Server-side sanitiser for article HTML (decision 2026-09-24). Runs on every save path:
// PATCH /api/articles/[cat]/[slug], POST /api/admin/articles and POST /api/admin/ingest.
// The article page renders stored HTML unescaped (dangerouslySetInnerHTML), so this is
// the only line of defence against scripts or event handlers reaching readers.
//
// Allow-list = what .nw-prose styles (app/globals.css) + the hero convention
// <figure data-nv-hero> (components/heroImage.ts) + what TinyMCE emits for the toolbar
// we ship (components/editor/TinyEditor.tsx). Relative URLs such as /uploads/… pass.
//
// Version pin: sanitize-html is pinned to 2.17.1 in package.json because 2.17.2+ depends
// on an ESM-only htmlparser2 (v10/v12) that Next 14's server bundler refuses to compile
// ("ESM packages (htmlparser2) need to be imported"). Re-test the build before bumping.

const SIZE = /^\d+(?:\.\d+)?(?:px|%|em|rem)$/
const SIZE_OR_AUTO = /^(?:\d+(?:\.\d+)?(?:px|%|em|rem)|auto|0)$/

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'span', 'code', 'kbd', 'pre',
    'a', 'ul', 'ol', 'li', 'blockquote', 'div', 'section',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption', 'dl', 'dt', 'dd',
  ],
  allowedAttributes: {
    '*':    ['class', 'id', 'style'],
    a:      ['href', 'name', 'target', 'rel', 'title'],
    img:    ['src', 'alt', 'title', 'width', 'height', 'loading'],
    figure: ['data-nv-hero'],
    td:     ['colspan', 'rowspan'],
    th:     ['colspan', 'rowspan', 'scope'],
    ol:     ['start', 'type', 'reversed'],
    li:     ['value'],
    col:    ['span'],
  },
  allowedStyles: {
    '*': {
      'text-align':      [/^(?:left|right|center|justify)$/],
      'float':           [/^(?:left|right|none)$/],
      'display':         [/^(?:block|inline|inline-block|table)$/],
      'width':           [SIZE],
      'height':          [SIZE],
      'max-width':       [SIZE],
      'margin':          [/^(?:(?:\d+(?:\.\d+)?(?:px|%|em|rem)|auto|0)\s*){1,4}$/],
      'margin-left':     [SIZE_OR_AUTO],
      'margin-right':    [SIZE_OR_AUTO],
      'margin-top':      [SIZE_OR_AUTO],
      'margin-bottom':   [SIZE_OR_AUTO],
      'padding-left':    [SIZE],
      'border-collapse': [/^(?:collapse|separate)$/],
      'vertical-align':  [/^(?:top|middle|bottom|baseline)$/],
      'list-style-type': [/^[a-z-]+$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // An <img> whose src was rejected (data: URI, javascript:, …) would otherwise survive
  // as an empty tag and render as a broken image.
  exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
  transformTags: {
    // Links that open a new tab must not hand the opener to the destination.
    a: (tagName, attribs) => {
      const next = { ...attribs }
      if (next.target === '_blank') next.rel = 'noopener noreferrer'
      else delete next.target
      return { tagName, attribs: next }
    },
  },
}

/** Returns sanitised HTML, or null when the input is missing or sanitises to nothing. */
export function sanitizeArticleHtml(html: unknown): string | null {
  if (typeof html !== 'string') return null
  const clean = sanitizeHtml(html, options).trim()
  return clean || null
}

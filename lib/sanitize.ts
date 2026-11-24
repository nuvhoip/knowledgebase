import sanitizeHtml from 'sanitize-html'
import { EMBED_IFRAME_HOSTS, isPlayableVideoUrl, parseEmbedUrl } from '@/lib/embeds'

// Server-side sanitiser for article HTML (decision 2026-09-24). Runs on every save path:
// PATCH /api/articles/[cat]/[slug], POST /api/admin/articles and POST /api/admin/ingest.
// The article page renders stored HTML unescaped (dangerouslySetInnerHTML), so this is
// the only line of defence against scripts or event handlers reaching readers.
//
// Allow-list = what .nw-prose styles (app/globals.css) + the hero convention
// <figure data-nv-hero> (components/heroImage.ts) + what TinyMCE emits for the toolbar
// we ship (components/editor/TinyEditor.tsx). Relative URLs such as /uploads/… pass.
//
// Video and embeds (decision 24 Nov 2026, lib/embeds.ts): <video> only plays KB uploads
// (/uploads/<id>.mp4) or MP4 links on our own file server; <iframe> only the canonical
// YouTube (nocookie), Vimeo and Scribe player URLs. Anything else loses its src and is dropped.
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
    'video', 'iframe',
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
    video:  ['src', 'poster', 'controls', 'preload', 'playsinline', 'muted', 'loop', 'width', 'height'],
    iframe: ['src', 'title', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy', 'width', 'height'],
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
  allowedSchemesByTag: { img: ['http', 'https'], video: ['https'], iframe: ['https'] },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'poster'],
  allowProtocolRelative: false,
  allowedIframeHostnames: [...EMBED_IFRAME_HOSTS],
  allowIframeRelativeUrls: false,
  // An <img>, <video> or <iframe> whose src was rejected (data: URI, javascript:, a host we
  // do not play, …) would otherwise survive as an empty tag and render as a broken box.
  exclusiveFilter: frame => (frame.tag === 'img' || frame.tag === 'video' || frame.tag === 'iframe') && !frame.attribs.src,
  transformTags: {
    video: (tagName, attribs) => {
      const next = { ...attribs }
      if (!next.src || !isPlayableVideoUrl(next.src)) delete next.src
      if (next.poster && !/^(?:https:\/\/|\/uploads\/)/.test(next.poster)) delete next.poster
      next.controls = 'controls'
      return { tagName, attribs: next }
    },
    iframe: (tagName, attribs) => {
      // Only the canonical player URL survives, whatever form it was pasted in
      const embed = attribs.src ? parseEmbedUrl(attribs.src) : null
      const next = { ...attribs }
      if (embed) next.src = embed.src
      else delete next.src
      return { tagName, attribs: next }
    },
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

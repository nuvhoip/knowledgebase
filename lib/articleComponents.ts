// Rich article components (decision 17 Nov 2026): one content model — article HTML in
// nuvho_kb.articles.content — plus a small vocabulary of classes that .nw-prose styles
// (app/globals.css, "Article components"). Nothing here is rendered specially: the classes
// pass lib/sanitize.ts as they are (class is allowed on every tag), TinyMCE keeps them, and
// the table of contents, search, JSON-LD and the vector sync read the HTML unchanged.
//
// Three users of this file, kept in step by lib/articleComponents.test.ts:
//   - the editor's Components menu (components/editor/TinyEditor.tsx) inserts SNIPPETS
//   - the HTML importer (lib/htmlImport.ts) maps foreign markup onto these classes
//   - app/globals.css styles them
//
// Icons are the brand library itself — <img class="nw-icon" src="/icons/<name>.svg" alt="">.
// No inline SVG (the sanitiser strips it) and no render-time expansion: the same tag works
// in the editor, on the page and in every plain-text extraction (alt="" adds no words).

/** Every class the article vocabulary uses. Anything else is dropped by the importer. */
export const COMPONENT_CLASSES = [
  'nw-icon',
  'nw-callout', 'nw-callout--info', 'nw-callout--risk', 'nw-callout--ok',
  'nw-cards', 'nw-cards--2', 'nw-cards--3', 'nw-card',
  'nw-steps',
  'nw-table',
  'nw-badge', 'nw-badge--ok', 'nw-badge--risk', 'nw-badge--info',
  'nw-cta', 'nw-cta__title', 'nw-cta__link',
  'nw-fineprint',
  // Imported pages and media (decision 24 Nov 2026): lead paragraph, figures, video, embeds
  'nw-lead', 'nw-figure', 'nw-video',
  'nw-embed', 'nw-embed--youtube', 'nw-embed--vimeo', 'nw-embed--scribe',
] as const

const CLASS_SET = new Set<string>(COMPONENT_CLASSES)

/** The vocabulary classes in a class attribute, in order, without duplicates. */
export function componentClasses(classAttr: string | undefined): string[] {
  if (!classAttr) return []
  const out: string[] = []
  for (const c of classAttr.split(/\s+/)) if (CLASS_SET.has(c) && !out.includes(c)) out.push(c)
  return out
}

/** Brand icon library: the files in public/icons (test keeps this list in sync). */
export const ARTICLE_ICONS = [
  'address-book', 'address-card', 'angle-down', 'angle-left', 'angle-right', 'arrow-left', 'arrow-right',
  'arrow-up-right', 'arrows-rotate', 'bars', 'bell-concierge', 'binoculars', 'book-open', 'booking-engine',
  'bookmark', 'browser', 'building-shield', 'business-time', 'calendar-days', 'calendar', 'chart-line-up',
  'check', 'circle-check', 'circle-info', 'circle-pause', 'circle-play', 'circle-question', 'circle-xmark',
  'clock', 'cloud-arrow-up', 'comments', 'credit-card-front', 'database', 'diagram-previous', 'envelope',
  'envelopes', 'experience-bus', 'eye-slash', 'eye', 'face-frown', 'file-chart-pie', 'file-contract',
  'file-invoice', 'file-lines', 'file-spreadsheet', 'filter-circle-dollar', 'floppy-disk', 'folder-open',
  'gauge-simple', 'gear', 'gears', 'glasses', 'hand-holding-seedling', 'handshake', 'hashtag',
  'head-side-headphones', 'hotel', 'house-chimney-heart', 'layer-group', 'lightbulb', 'list',
  'location-dot', 'lock', 'magnifying-glass-chart', 'magnifying-glass-dollar', 'magnifying-glass-location',
  'magnifying-glass', 'megaphone', 'messages-dollar', 'money-bill-transfer', 'money-bill', 'pen-to-square',
  'people-group', 'phone-office', 'piggy-bank', 'plus', 'rectangle-ad', 'rectangle-list',
  'right-from-bracket', 'rocket', 'sitemap', 'solar-system', 'star', 'tags', 'thumbs-down', 'thumbs-up',
  'trash-can', 'triangle-exclamation', 'usd-square', 'user-tie', 'user', 'users-gear', 'users-line',
  'website', 'xmark',
] as const

export type ArticleIcon = (typeof ARTICLE_ICONS)[number]

export function isArticleIcon(name: string): name is ArticleIcon {
  return (ARTICLE_ICONS as readonly string[]).includes(name)
}

/** Decorative brand icon (empty alt: the text beside it carries the meaning). */
export function iconHtml(name: ArticleIcon): string {
  return `<img class="nw-icon" src="/icons/${name}.svg" alt="">`
}

export type CalloutVariant = 'tip' | 'info' | 'risk' | 'ok'

export const CALLOUT_ICONS: Record<CalloutVariant, ArticleIcon> = {
  tip: 'lightbulb',
  info: 'circle-info',
  risk: 'triangle-exclamation',
  ok: 'circle-check',
}

/** Callout frame; `title` and `bodyHtml` are already-escaped HTML. */
export function calloutHtml(variant: CalloutVariant, titleHtml: string, bodyHtml: string): string {
  const cls = variant === 'tip' ? 'nw-callout' : `nw-callout nw-callout--${variant}`
  const title = titleHtml ? `<h4>${titleHtml}</h4>` : ''
  return `<div class="${cls}">${iconHtml(CALLOUT_ICONS[variant])}<div>${title}${bodyHtml}</div></div>`
}

export interface Snippet {
  /** Menu label in the editor's Components menu. */
  label: string
  html: string
}

const p = (text: string) => `<p>${text}</p>`
const card = (n: number) => `<div class="nw-card"><h4>Card ${n} title</h4>${p('One or two sentences.')}</div>`

/** Starting blocks for the Components menu. Authors replace the placeholder text in place. */
export const SNIPPETS: Record<string, Snippet> = {
  calloutTip:  { label: 'Callout: tip',     html: calloutHtml('tip',  'Tip', p('The point worth remembering.')) },
  calloutInfo: { label: 'Callout: note',    html: calloutHtml('info', 'Note', p('Context the reader should have.')) },
  calloutRisk: { label: 'Callout: risk',    html: calloutHtml('risk', 'Watch out', p('What goes wrong, and how to avoid it.')) },
  calloutOk:   { label: 'Callout: success', html: calloutHtml('ok',   'Good practice', p('What doing it right looks like.')) },
  cards2: { label: 'Cards: 2 columns', html: `<div class="nw-cards nw-cards--2">${card(1)}${card(2)}</div>` },
  cards3: { label: 'Cards: 3 columns', html: `<div class="nw-cards nw-cards--3">${card(1)}${card(2)}${card(3)}</div>` },
  steps: {
    label: 'Numbered steps',
    html: `<ol class="nw-steps">${[1, 2, 3].map(n => `<li><h4>Step ${n}</h4>${p('What to do and why.')}</li>`).join('')}</ol>`,
  },
  table: {
    label: 'Table',
    html: '<div class="nw-table"><table><thead><tr><th>Item</th><th>Detail</th><th>Notes</th></tr></thead>'
      + '<tbody><tr><td>Row</td><td>Value</td><td>Comment</td></tr><tr><td>Row</td><td>Value</td><td>Comment</td></tr></tbody></table></div>',
  },
  badgeNeutral: { label: 'Badge: neutral', html: '<span class="nw-badge">Label</span>&nbsp;' },
  badgeOk:      { label: 'Badge: success', html: '<span class="nw-badge nw-badge--ok">Essential</span>&nbsp;' },
  badgeRisk:    { label: 'Badge: risk',    html: '<span class="nw-badge nw-badge--risk">Action</span>&nbsp;' },
  cta: {
    label: 'Call to action',
    html: '<div class="nw-cta"><p class="nw-cta__title">Next step</p>'
      + p('One sentence on why to act now.')
      + '<p><a class="nw-cta__link" href="https://nuvho.com">Talk to Nuvho</a></p></div>',
  },
  fineprint: { label: 'Fine print', html: '<p class="nw-fineprint">General information only. Not legal advice.</p>' },
  divider:   { label: 'Divider', html: '<hr>' },
}

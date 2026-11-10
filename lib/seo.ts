// SEO + GEO (generative engine optimisation) helpers for knowledge.nuvho.com.
//
// Search engines and AI answer engines (ChatGPT search, Perplexity, Google AI Overviews,
// Claude, Copilot) read the same signals: a clean canonical URL, a short answer-first
// description, structured data (JSON-LD) that names what the page is about, crawlable
// HTML, a sitemap, and — for LLM crawlers — /llms.txt and /llms-full.txt. Everything here
// is pure (no DB), so it is unit tested in lib/seo.test.ts.

import { decodeEntities, headingText } from './toc'

export const SITE_URL = 'https://knowledge.nuvho.com'
export const SITE_NAME = 'Nuvho Knowledge Base'
export const SITE_DESCRIPTION =
  'Guides, how-tos and answers for hoteliers using Nuvho — revenue management, distribution, booking engine, digital marketing and more.'
export const SITE_LANGUAGE = 'en-AU'

/** Nuvho as publisher and author of every article (no named authors yet). */
export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': 'https://nuvho.com/#organization',
  name: 'Nuvho',
  url: 'https://nuvho.com',
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo-primary.svg` },
  sameAs: [
    'https://www.linkedin.com/company/nuvho',
    'https://www.facebook.com/nuvho',
    'https://instagram.com/nuvho',
  ],
} as const

/**
 * Crawlers that feed AI answer engines and assistants. robots.ts names them explicitly so
 * the public KB stays citable even if the catch-all rule is ever tightened. Remove a
 * training-only crawler (GPTBot, CCBot, Google-Extended, Applebot-Extended) here if Nuvho
 * decides to opt out of model training while staying in AI search results.
 */
export const AI_CRAWLERS = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Bingbot',
  'CCBot', 'DuckAssistBot', 'MistralAI-User',
]

/** Paths that must never be indexed or used as answers. */
export const PRIVATE_PATHS = ['/admin', '/api/', '/login', '/signup', '/auth/', '/search', '/articles/*/*/edit']

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

export function articlePath(categorySlug: string, slug: string): string {
  return `/articles/${categorySlug}/${slug}`
}

/** JSON for a <script type="application/ld+json">, safe to inline (no "</script>" break-out). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Article HTML → plain text (for word counts and FAQ answers). */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return ''
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

/**
 * Article HTML → light markdown for /llms-full.txt: headings, list items, paragraphs and
 * links survive; everything else becomes text. LLMs read this far more reliably than HTML.
 */
export function htmlToMarkdown(html: string | undefined | null): string {
  if (!html) return ''
  let s = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l, inner) =>
    `\n\n${'#'.repeat(Math.min(Number(l), 6))} ${headingText(inner)}\n\n`)
  s = s.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const text = htmlToText(inner)
    return text ? `[${text}](${absoluteUrl(decodeEntities(href))})` : ''
  })
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|ul|ol|table|tr|blockquote|div|pre)>/gi, '\n\n')
  s = s.replace(/<\/t[dh]>/gi, ' | ')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  return s
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface FaqEntry {
  question: string
  answer: string
}

const HEADING = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi

/**
 * Question-style headings ("How do I …?") with the text up to the next heading. Articles
 * written in this shape are the ones AI engines quote, and they get FAQPage JSON-LD.
 */
export function extractFaq(html: string | undefined | null, max = 10): FaqEntry[] {
  if (!html) return []
  const heads: { level: number; text: string; start: number; end: number }[] = []
  HEADING.lastIndex = 0
  for (let m = HEADING.exec(html); m; m = HEADING.exec(html)) {
    heads.push({ level: Number(m[1]), text: headingText(m[2]), start: m.index, end: m.index + m[0].length })
  }
  const out: FaqEntry[] = []
  heads.forEach((h, i) => {
    if (out.length >= max || h.level < 2 || h.level > 4 || !h.text.endsWith('?')) return
    const answer = htmlToText(html.slice(h.end, heads[i + 1]?.start ?? html.length))
    if (answer.length < 20) return
    out.push({ question: h.text, answer: answer.length > 1200 ? answer.slice(0, 1197).replace(/\s+\S*$/, '') + '…' : answer })
  })
  return out
}

export interface ArticleLdInput {
  title: string
  description: string
  categorySlug: string
  slug: string
  categoryTitle: string
  updatedIso?: string
  readTime?: number
  html?: string | null
  heroSrc?: string | null
  tags?: { name: string; slug: string }[]
}

/** TechArticle + BreadcrumbList (+ FAQPage when the article has 2+ question headings). */
export function articleJsonLd(a: ArticleLdInput) {
  const url = absoluteUrl(articlePath(a.categorySlug, a.slug))
  const words = htmlToText(a.html).split(/\s+/).filter(Boolean).length
  const tags = a.tags ?? []
  const faq = extractFaq(a.html)

  const article: Record<string, unknown> = {
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline: a.title.length > 110 ? a.title.slice(0, 107) + '…' : a.title,
    name: a.title,
    description: a.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: a.categoryTitle,
    inLanguage: SITE_LANGUAGE,
    isAccessibleForFree: true,
    author: { '@id': ORGANIZATION['@id'] },
    publisher: { '@id': ORGANIZATION['@id'] },
    isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website` },
  }
  if (a.updatedIso) article.dateModified = a.updatedIso
  if (words) article.wordCount = words
  if (a.readTime) article.timeRequired = `PT${a.readTime}M`
  if (a.heroSrc) article.image = absoluteUrl(a.heroSrc)
  if (tags.length) {
    article.keywords = tags.map(t => t.name).join(', ')
    article.about = tags.map(t => ({ '@type': 'Thing', name: t.name, url: absoluteUrl(`/tags/${t.slug}`) }))
  }

  const graph: Record<string, unknown>[] = [
    ORGANIZATION as unknown as Record<string, unknown>,
    article,
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: a.categoryTitle, item: absoluteUrl(`/categories/${a.categorySlug}`) },
        { '@type': 'ListItem', position: 3, name: a.title, item: url },
      ],
    },
  ]
  if (faq.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.map(f => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}

/** WebSite (with the site search) + Organization, for the home page. */
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      ORGANIZATION,
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: SITE_LANGUAGE,
        publisher: { '@id': ORGANIZATION['@id'] },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

/** CollectionPage + ItemList for a category or tag listing. */
export function collectionJsonLd(path: string, name: string, description: string, items: { title: string; path: string }[]) {
  const url = absoluteUrl(path)
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name,
    description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.title, url: absoluteUrl(it.path) })),
    },
  }
}

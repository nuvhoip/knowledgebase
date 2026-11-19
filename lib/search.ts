import Fuse, { type Expression, type IFuseOptions } from 'fuse.js'
import { getSearchCorpus } from './data'
import type { SearchDocument } from './types'

// Fuzzy search over PUBLISHED articles (typo-tolerant: "pasword resett" finds
// "Reset your password"); the admin dashboard searches pending ones too. The corpus
// is small — one row per article — so each scope is indexed in memory with Fuse.js
// and rebuilt at most every INDEX_TTL_MS, rather than needing a Postgres extension
// such as pg_trgm.

interface IndexedDocument {
  title: string
  description: string
  topics: string
  text: string
  doc: SearchDocument
}

const KEYS = [
  { name: 'title', weight: 4 },
  { name: 'description', weight: 2 },
  { name: 'topics', weight: 1 },
  { name: 'text', weight: 1 },
] as const

const FUSE_OPTIONS: IFuseOptions<IndexedDocument> = {
  keys: KEYS.map(k => ({ ...k })),
  includeScore: true,
  // 0 = exact only, 1 = anything. 0.3 allows ~1 typo per 4 characters per word, and
  // stops three-letter words matching any other three-letter word.
  threshold: 0.3,
  // Article bodies are long; a match anywhere in them counts.
  ignoreLocation: true,
  minMatchCharLength: 2,
  // Lets short words opt out of fuzziness with the ' (include) operator — see anyField().
  useExtendedSearch: true,
}

// Words this short must appear as typed: one typo in "api" or "adr" is a different word.
const EXACT_MAX_CHARS = 4

/** 'public' indexes PUBLISHED articles (the /search page); 'admin' indexes every article, pending too. */
export type SearchScope = 'public' | 'admin'

// Admins search right after creating or editing, so their index goes stale sooner.
const INDEX_TTL_MS: Record<SearchScope, number> = { public: 60_000, admin: 10_000 }
const MAX_TEXT_CHARS = 20_000

// Words that carry no meaning in a help-centre query and would otherwise have to match.
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in', 'is', 'it',
  'my', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where', 'why', 'with', 'you',
])

// Leading/trailing punctuation on a word ("password?" → "password"); Unicode-aware so
// accented words survive. Built with RegExp because tsconfig's default target rejects /u literals.
const EDGE_PUNCTUATION = new RegExp('^[^\\p{L}\\p{N}]+|[^\\p{L}\\p{N}]+$', 'gu')

const cache = new Map<SearchScope, { fuse: Fuse<IndexedDocument>; builtAt: number }>()
const building = new Map<SearchScope, Promise<Fuse<IndexedDocument>>>()

/** Article HTML → plain text for indexing. */
function htmlToText(html: string | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS)
}

async function buildIndex(scope: SearchScope): Promise<Fuse<IndexedDocument>> {
  const corpus = await getSearchCorpus(scope === 'admin')
  const docs = corpus.map(doc => ({
    title: doc.article.title,
    description: doc.article.description,
    // Category, sub-category and (KB_TAGS_ENABLED) tag names
    topics: `${doc.categoryTitle} ${doc.subcategoryTitle} ${doc.tagNames ?? ''}`.trim(),
    text: htmlToText(doc.article.content),
    doc,
  }))
  return new Fuse(docs, FUSE_OPTIONS)
}

async function getIndex(scope: SearchScope): Promise<Fuse<IndexedDocument>> {
  const cached = cache.get(scope)
  if (cached && Date.now() - cached.builtAt < INDEX_TTL_MS[scope]) return cached.fuse
  // One rebuild per scope at a time; concurrent searches share it.
  let pending = building.get(scope)
  if (!pending) {
    pending = buildIndex(scope)
      .then(fuse => {
        cache.set(scope, { fuse, builtAt: Date.now() })
        return fuse
      })
      .finally(() => { building.delete(scope) })
    building.set(scope, pending)
  }
  try {
    return await pending
  } catch (err) {
    // Keep serving the last good index if the database is briefly unavailable.
    const stale = cache.get(scope)
    if (stale) return stale.fuse
    throw err
  }
}

function tokenize(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(EDGE_PUNCTUATION, ''))
    .filter(w => w.length >= 2)
  const meaningful = words.filter(w => !STOP_WORDS.has(w))
  return meaningful.length > 0 ? meaningful : words
}

/** Any of the indexed fields matches this word — fuzzily, or exactly for short words. */
function anyField(word: string): Expression {
  const pattern = word.length <= EXACT_MAX_CHARS ? `'${word}` : word
  return { $or: KEYS.map(k => ({ [k.name]: pattern })) }
}

/**
 * Fuzzy-search articles, best match first: PUBLISHED ones, or every article for
 * scope 'admin'. Every meaningful word must match some field; if nothing does,
 * falls back to articles matching any word. Visibility is not applied here — the
 * public caller filters with canView().
 */
export async function searchArticles(query: string, limit = 50, scope: SearchScope = 'public'): Promise<SearchDocument[]> {
  const phrase = query.trim().toLowerCase()
  const words = tokenize(phrase)
  if (words.length === 0) return []

  const fuse = await getIndex(scope)
  let results = fuse.search({ $and: words.map(anyField) })
  if (results.length === 0 && words.length > 1) {
    results = fuse.search({ $or: words.map(anyField) })
  }

  // Fuse scores 0 (perfect) to 1. Exact phrase hits are what a reader most likely
  // meant, so they rank above near-misses: title > description > body.
  return results
    .map(r => {
      const { title, description, text } = r.item
      let score = r.score ?? 1
      if (title.toLowerCase().includes(phrase)) score -= 0.5
      else if (description.toLowerCase().includes(phrase)) score -= 0.25
      else if (text.toLowerCase().includes(phrase)) score -= 0.1
      return { doc: r.item.doc, score }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(r => r.doc)
}

export type Visibility = 'public' | 'private'

export type { Tag } from './tags'

export interface Article {
  slug: string
  title: string
  description: string
  content?: string
  categorySlug: string
  subcategorySlug: string
  updatedAt: string
  /** updated_at as YYYY-MM-DD, for <time dateTime>, the sitemap and JSON-LD. */
  updatedAtIso: string
  readTime: number // minutes
  featured?: boolean
  status: 'pending' | 'published'
  /** Explicit override. `null` = inherit from sub-category → category. */
  visibility: Visibility | null
  /** Resolved visibility after applying the inheritance chain. Always 'public' or 'private'. */
  effectiveVisibility: Visibility
  categoryTitle?: string
  subcategoryTitle?: string
}

export interface Subcategory {
  slug: string
  title: string
  description: string
  categorySlug: string
  sortOrder: number
  articleCount: number
  /** Explicit override. `null` = inherit from the parent category. */
  visibility: Visibility | null
  articles: Article[]
}

export interface Category {
  slug: string
  title: string
  description: string
  icon: string // icon filename without path, e.g. "rocket.svg"
  articleCount: number
  articles: Article[]
  subcategories: Subcategory[]
  /** Top of the inheritance chain — always an explicit value, defaults to 'public'. */
  visibility: Visibility
}

/** A published article plus its topic names, as indexed by the fuzzy search (lib/search.ts). */
export interface SearchDocument {
  article: Article
  categoryTitle: string
  subcategoryTitle: string
  /** Tag names, space-separated (empty unless KB_TAGS_ENABLED). */
  tagNames?: string
}

/** A search-as-you-type match — the lightweight payload of /api/search?suggest=1. */
export interface SearchSuggestion {
  title: string
  description: string
  categorySlug: string
  slug: string
  categoryTitle: string
  isPrivate: boolean
}

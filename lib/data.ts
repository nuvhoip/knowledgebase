import pool from './db'
import { Article, Category, SearchDocument, Subcategory, Tag, Visibility } from './types'
import { isTagsEnabled } from './flags'

// ─── DB row types ────────────────────────────────────────────────────────────

interface CategoryRow {
  slug: string
  title: string
  description: string
  icon: string
  article_count: number
  visibility: Visibility
}

interface SubcategoryRow {
  slug: string
  title: string
  description: string
  category_slug: string
  sort_order: number
  article_count: number
  visibility: Visibility | null
}

interface ArticleRow {
  slug: string
  title: string
  description: string
  content: string | null
  category_slug: string
  subcategory_slug: string
  updated_at: string
  updated_at_iso: string
  read_time: number
  featured: boolean
  status: 'pending' | 'published'
  visibility: Visibility | null
  category_visibility: Visibility
  subcategory_visibility: Visibility | null
  category_title: string
  subcategory_title: string
}

// Article select fragment shared by every article query below — joins in the
// category/sub-category visibility needed to resolve effective visibility.
const ARTICLE_SELECT = `
  SELECT a.slug, a.title, a.description, a.content, a.category_slug, a.subcategory_slug,
         to_char(a.updated_at, 'Mon DD, YYYY') AS updated_at,
         to_char(a.updated_at, 'YYYY-MM-DD') AS updated_at_iso,
         a.read_time, a.featured, a.status, a.visibility,
         c.visibility AS category_visibility,
         s.visibility AS subcategory_visibility,
         c.title AS category_title, s.title AS subcategory_title
  FROM nuvho_kb.articles a
  JOIN nuvho_kb.categories c ON c.slug = a.category_slug
  JOIN nuvho_kb.subcategories s ON s.slug = a.subcategory_slug
`

// ─── Visibility resolution ───────────────────────────────────────────────────

/** Most specific explicit setting wins: article → sub-category → category. */
export function resolveVisibility(
  articleVisibility: Visibility | null,
  subcategoryVisibility: Visibility | null,
  categoryVisibility: Visibility
): Visibility {
  return articleVisibility ?? subcategoryVisibility ?? categoryVisibility ?? 'public'
}

/** Whether a viewer (logged in or not) may see something with this effective visibility. */
export function canView(effectiveVisibility: Visibility, hasSession: boolean): boolean {
  return effectiveVisibility === 'public' || hasSession
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapArticle(row: ArticleRow): Article {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    content: row.content ?? undefined,
    categorySlug: row.category_slug,
    subcategorySlug: row.subcategory_slug,
    updatedAt: row.updated_at,
    updatedAtIso: row.updated_at_iso,
    readTime: row.read_time,
    featured: row.featured,
    status: row.status,
    visibility: row.visibility,
    effectiveVisibility: resolveVisibility(row.visibility, row.subcategory_visibility, row.category_visibility),
    categoryTitle: row.category_title,
    subcategoryTitle: row.subcategory_title,
  }
}

function mapSubcategory(row: SubcategoryRow, articles: Article[]): Subcategory {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    categorySlug: row.category_slug,
    sortOrder: row.sort_order,
    articleCount: row.article_count,
    visibility: row.visibility,
    articles,
  }
}

function mapCategory(row: CategoryRow, articles: Article[], subcategories: Subcategory[]): Category {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    articleCount: row.article_count,
    articles,
    subcategories,
    visibility: row.visibility,
  }
}

// ─── Public API (published-only) ──────────────────────────────────────────────
//
// Visibility is NOT filtered out here — every function below returns the full
// set annotated with `visibility` / `effectiveVisibility`. Callers (page
// components, the search API route) know whether the current visitor has a
// session and decide what to hide or gate using `canView()` above. This keeps
// the access-control decision next to the request/session, not buried in the
// data layer.

/** All categories with their PUBLISHED articles, grouped into sub-categories. */
export async function getCategories(): Promise<Category[]> {
  const catResult = await pool.query<CategoryRow>(
    `SELECT slug, title, description, icon, article_count, visibility
     FROM nuvho_kb.categories
     ORDER BY sort_order, title`
  )
  if (catResult.rows.length === 0) return []

  const slugs = catResult.rows.map(r => r.slug)

  const subResult = await pool.query<SubcategoryRow>(
    `SELECT slug, title, description, category_slug, sort_order, article_count, visibility
     FROM nuvho_kb.subcategories
     WHERE category_slug = ANY($1::text[])
     ORDER BY sort_order, title`,
    [slugs]
  )

  const artResult = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE a.category_slug = ANY($1::text[]) AND a.status = 'published'
     ORDER BY a.sort_order, a.title`,
    [slugs]
  )

  const articlesBySubcategory = new Map<string, Article[]>()
  const articlesByCategory = new Map<string, Article[]>()
  slugs.forEach(s => articlesByCategory.set(s, []))
  artResult.rows.forEach(row => {
    const article = mapArticle(row)
    articlesByCategory.get(row.category_slug)!.push(article)
    if (!articlesBySubcategory.has(row.subcategory_slug)) articlesBySubcategory.set(row.subcategory_slug, [])
    articlesBySubcategory.get(row.subcategory_slug)!.push(article)
  })

  const subsByCategory = new Map<string, Subcategory[]>()
  slugs.forEach(s => subsByCategory.set(s, []))
  subResult.rows.forEach(row => {
    subsByCategory.get(row.category_slug)!.push(mapSubcategory(row, articlesBySubcategory.get(row.slug) ?? []))
  })

  return catResult.rows.map(row =>
    mapCategory(row, articlesByCategory.get(row.slug) ?? [], subsByCategory.get(row.slug) ?? [])
  )
}

/** Single category with its PUBLISHED articles and sub-categories. Returns null if not found. */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const catResult = await pool.query<CategoryRow>(
    `SELECT slug, title, description, icon, article_count, visibility
     FROM nuvho_kb.categories WHERE slug = $1`,
    [slug]
  )
  if (catResult.rows.length === 0) return null

  const subResult = await pool.query<SubcategoryRow>(
    `SELECT slug, title, description, category_slug, sort_order, article_count, visibility
     FROM nuvho_kb.subcategories
     WHERE category_slug = $1
     ORDER BY sort_order, title`,
    [slug]
  )

  const artResult = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE a.category_slug = $1 AND a.status = 'published'
     ORDER BY a.sort_order, a.title`,
    [slug]
  )

  const articlesBySubcategory = new Map<string, Article[]>()
  const allArticles: Article[] = []
  artResult.rows.forEach(row => {
    const article = mapArticle(row)
    allArticles.push(article)
    if (!articlesBySubcategory.has(row.subcategory_slug)) articlesBySubcategory.set(row.subcategory_slug, [])
    articlesBySubcategory.get(row.subcategory_slug)!.push(article)
  })

  const subcategories = subResult.rows.map(row =>
    mapSubcategory(row, articlesBySubcategory.get(row.slug) ?? [])
  )

  return mapCategory(catResult.rows[0], allArticles, subcategories)
}

/** Single PUBLISHED article by category + article slug. Returns null if not found or pending. */
export async function getArticleBySlug(
  categorySlug: string,
  articleSlug: string
): Promise<Article | null> {
  const result = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE a.category_slug = $1 AND a.slug = $2 AND a.status = 'published'`,
    [categorySlug, articleSlug]
  )
  return result.rows.length === 0 ? null : mapArticle(result.rows[0])
}

/** Featured PUBLISHED articles, up to `limit`. */
export async function getFeaturedArticles(limit = 4): Promise<Article[]> {
  const result = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE a.featured = true AND a.status = 'published'
     ORDER BY a.sort_order, a.title
     LIMIT $1`,
    [limit]
  )
  return result.rows.map(mapArticle)
}

/** Every PUBLISHED article with its topic names — the corpus lib/search.ts fuzzy-indexes. */
export async function getSearchCorpus(): Promise<SearchDocument[]> {
  const result = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     WHERE a.status = 'published'
     ORDER BY a.category_slug, a.sort_order, a.title`
  )
  const tagNames = isTagsEnabled() ? await getTagNamesByArticle().catch(() => new Map<string, string>()) : null
  return result.rows.map(row => ({
    article: mapArticle(row),
    categoryTitle: row.category_title,
    subcategoryTitle: row.subcategory_title,
    tagNames: tagNames?.get(`${row.category_slug}/${row.slug}`) ?? '',
  }))
}

// ─── Tags (KB_TAGS_ENABLED — callers check the flag) ─────────────────────────
//
// Tables: nuvho_kb.topics (the tag) and nuvho_kb.article_topics (article ↔ tag). See lib/tags.ts.

/** Effective visibility in SQL, same chain as resolveVisibility(). */
const EFFECTIVE_VISIBILITY = `COALESCE(a.visibility, s.visibility, c.visibility, 'public')`

/** "category/slug" → space-separated tag names, for the search index. */
async function getTagNamesByArticle(): Promise<Map<string, string>> {
  const result = await pool.query<{ key: string; names: string }>(
    `SELECT a.category_slug || '/' || a.slug AS key, string_agg(t.name, ' ' ORDER BY t.name) AS names
     FROM nuvho_kb.article_topics at
     JOIN nuvho_kb.topics t ON t.id = at.topic_id
     JOIN nuvho_kb.articles a ON a.id = at.article_id
     WHERE a.status = 'published'
     GROUP BY 1`
  )
  return new Map(result.rows.map(r => [r.key, r.names]))
}

/** Tags of one article (any status), in display order. */
export async function getArticleTags(categorySlug: string, slug: string): Promise<Tag[]> {
  const result = await pool.query<Tag>(
    `SELECT t.slug, t.name
     FROM nuvho_kb.article_topics at
     JOIN nuvho_kb.topics t ON t.id = at.topic_id
     JOIN nuvho_kb.articles a ON a.id = at.article_id
     WHERE a.category_slug = $1 AND a.slug = $2
     ORDER BY t.sort_order, t.name`,
    [categorySlug, slug]
  )
  return result.rows
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const result = await pool.query<Tag>('SELECT slug, name FROM nuvho_kb.topics WHERE slug = $1', [slug])
  return result.rows[0] ?? null
}

/** PUBLISHED articles carrying a tag, newest first. Visibility is left to the caller (canView). */
export async function getArticlesByTag(tagSlug: string): Promise<Article[]> {
  const result = await pool.query<ArticleRow>(
    `${ARTICLE_SELECT}
     JOIN nuvho_kb.article_topics at ON at.article_id = a.id
     JOIN nuvho_kb.topics t ON t.id = at.topic_id
     WHERE t.slug = $1 AND a.status = 'published'
     ORDER BY a.updated_at DESC, a.title`,
    [tagSlug]
  )
  return result.rows.map(mapArticle)
}

/**
 * PUBLISHED articles sharing the most tags with this one (ties: same category first, then
 * newest). Visibility is left to the caller.
 */
export async function getRelatedArticles(categorySlug: string, slug: string, limit = 6): Promise<Article[]> {
  const result = await pool.query<ArticleRow>(
    `WITH me AS (
       SELECT a.id, a.category_slug FROM nuvho_kb.articles a WHERE a.category_slug = $1 AND a.slug = $2
     ), shared AS (
       SELECT other.article_id, COUNT(*) AS n
       FROM nuvho_kb.article_topics mine
       JOIN me ON me.id = mine.article_id
       JOIN nuvho_kb.article_topics other ON other.topic_id = mine.topic_id AND other.article_id <> me.id
       GROUP BY other.article_id
     )
     ${ARTICLE_SELECT}
     JOIN shared ON shared.article_id = a.id
     WHERE a.status = 'published'
     ORDER BY shared.n DESC, (a.category_slug = $1) DESC, a.updated_at DESC, a.title
     LIMIT $3`,
    [categorySlug, slug, limit]
  )
  return result.rows.map(mapArticle)
}

export interface TagUsage extends Tag {
  /** Published articles that anyone can read. */
  publicCount: number
  /** All published articles, private included. */
  totalCount: number
}

/** Every tag used by at least one published article, most used first. */
export async function getTagUsage(): Promise<TagUsage[]> {
  const result = await pool.query<{ slug: string; name: string; public_count: string; total_count: string }>(
    `SELECT t.slug, t.name,
            COUNT(*) FILTER (WHERE ${EFFECTIVE_VISIBILITY} = 'public') AS public_count,
            COUNT(*) AS total_count
     FROM nuvho_kb.topics t
     JOIN nuvho_kb.article_topics at ON at.topic_id = t.id
     JOIN nuvho_kb.articles a ON a.id = at.article_id AND a.status = 'published'
     JOIN nuvho_kb.categories c ON c.slug = a.category_slug
     JOIN nuvho_kb.subcategories s ON s.slug = a.subcategory_slug
     GROUP BY t.id
     ORDER BY COUNT(*) DESC, t.name`
  )
  return result.rows.map(r => ({
    slug: r.slug,
    name: r.name,
    publicCount: Number(r.public_count),
    totalCount: Number(r.total_count),
  }))
}

/** Category slugs for generateStaticParams. */
export async function getAllCategorySlugs(): Promise<string[]> {
  const result = await pool.query<{ slug: string }>(
    'SELECT slug FROM nuvho_kb.categories ORDER BY sort_order, title'
  )
  return result.rows.map(r => r.slug)
}

/** PUBLISHED article slug pairs for generateStaticParams. */
export async function getAllArticleSlugs(): Promise<{ categorySlug: string; slug: string }[]> {
  const result = await pool.query<{ category_slug: string; slug: string }>(
    `SELECT category_slug, slug FROM nuvho_kb.articles
     WHERE status = 'published'
     ORDER BY category_slug, sort_order, title`
  )
  return result.rows.map(r => ({ categorySlug: r.category_slug, slug: r.slug }))
}

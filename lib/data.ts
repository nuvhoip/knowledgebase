import pool from './db'
import { Article, Category } from './types'

// ─── DB row types ────────────────────────────────────────────────────────────

interface CategoryRow {
  slug: string
  title: string
  description: string
  icon: string
  article_count: number
}

interface ArticleRow {
  slug: string
  title: string
  description: string
  content: string | null
  category_slug: string
  updated_at: string
  read_time: number
  featured: boolean
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapArticle(row: ArticleRow): Article {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    content: row.content ?? undefined,
    categorySlug: row.category_slug,
    updatedAt: row.updated_at,
    readTime: row.read_time,
    featured: row.featured,
  }
}

function mapCategory(row: CategoryRow, articles: Article[]): Category {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon: row.icon,
    articleCount: row.article_count,
    articles,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** All categories with their articles. */
export async function getCategories(): Promise<Category[]> {
  const catResult = await pool.query<CategoryRow>(
    `SELECT slug, title, description, icon, article_count
     FROM nuvho_kb.categories
     ORDER BY sort_order, title`
  )
  if (catResult.rows.length === 0) return []

  const slugs = catResult.rows.map(r => r.slug)
  const artResult = await pool.query<ArticleRow>(
    `SELECT slug, title, description, content, category_slug,
            to_char(updated_at, 'Mon DD, YYYY') AS updated_at,
            read_time, featured
     FROM nuvho_kb.articles
     WHERE category_slug = ANY($1::text[])
     ORDER BY sort_order, title`,
    [slugs]
  )

  const byCategory = new Map<string, Article[]>()
  slugs.forEach(s => byCategory.set(s, []))
  artResult.rows.forEach(row => byCategory.get(row.category_slug)!.push(mapArticle(row)))

  return catResult.rows.map(row => mapCategory(row, byCategory.get(row.slug) ?? []))
}

/** Single category with its articles. Returns null if not found. */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const catResult = await pool.query<CategoryRow>(
    `SELECT slug, title, description, icon, article_count
     FROM nuvho_kb.categories WHERE slug = $1`,
    [slug]
  )
  if (catResult.rows.length === 0) return null

  const artResult = await pool.query<ArticleRow>(
    `SELECT slug, title, description, content, category_slug,
            to_char(updated_at, 'Mon DD, YYYY') AS updated_at,
            read_time, featured
     FROM nuvho_kb.articles
     WHERE category_slug = $1
     ORDER BY sort_order, title`,
    [slug]
  )

  return mapCategory(catResult.rows[0], artResult.rows.map(mapArticle))
}

/** Single article by category + article slug. Returns null if not found. */
export async function getArticleBySlug(
  categorySlug: string,
  articleSlug: string
): Promise<Article | null> {
  const result = await pool.query<ArticleRow>(
    `SELECT slug, title, description, content, category_slug,
            to_char(updated_at, 'Mon DD, YYYY') AS updated_at,
            read_time, featured
     FROM nuvho_kb.articles
     WHERE category_slug = $1 AND slug = $2`,
    [categorySlug, articleSlug]
  )
  return result.rows.length === 0 ? null : mapArticle(result.rows[0])
}

/** Featured articles, up to `limit`. */
export async function getFeaturedArticles(limit = 4): Promise<Article[]> {
  const result = await pool.query<ArticleRow>(
    `SELECT slug, title, description, content, category_slug,
            to_char(updated_at, 'Mon DD, YYYY') AS updated_at,
            read_time, featured
     FROM nuvho_kb.articles
     WHERE featured = true
     ORDER BY sort_order, title
     LIMIT $1`,
    [limit]
  )
  return result.rows.map(mapArticle)
}

/** Full-text search across title and description. */
export async function searchArticles(query: string): Promise<Article[]> {
  if (!query.trim()) return []
  const result = await pool.query<ArticleRow>(
    `SELECT slug, title, description, content, category_slug,
            to_char(updated_at, 'Mon DD, YYYY') AS updated_at,
            read_time, featured
     FROM nuvho_kb.articles
     WHERE title ILIKE $1 OR description ILIKE $1
     ORDER BY
       CASE WHEN title ILIKE $1 THEN 0 ELSE 1 END,
       title
     LIMIT 50`,
    [`%${query}%`]
  )
  return result.rows.map(mapArticle)
}

/** Category slugs for generateStaticParams. */
export async function getAllCategorySlugs(): Promise<string[]> {
  const result = await pool.query<{ slug: string }>(
    'SELECT slug FROM nuvho_kb.categories ORDER BY sort_order, title'
  )
  return result.rows.map(r => r.slug)
}

/** Article slug pairs for generateStaticParams. */
export async function getAllArticleSlugs(): Promise<{ categorySlug: string; slug: string }[]> {
  const result = await pool.query<{ category_slug: string; slug: string }>(
    'SELECT category_slug, slug FROM nuvho_kb.articles ORDER BY category_slug, sort_order, title'
  )
  return result.rows.map(r => ({ categorySlug: r.category_slug, slug: r.slug }))
}

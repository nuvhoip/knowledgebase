// The public face of the KB for crawlers: what the sitemap, /llms.txt and /llms-full.txt
// list. Only PUBLISHED articles whose effective visibility is public, in public categories.

import { getCategories, getTagUsage } from './data'
import { isTagsEnabled } from './flags'
import type { Article, Category, Tag } from './types'

/** Tag pages need at least this many public articles to be listed (see app/tags/[slug]). */
export const MIN_TAG_ARTICLES = 2

export interface PublicCategory {
  category: Category
  articles: Article[]
}

export interface PublicIndex {
  categories: PublicCategory[]
  tags: Tag[]
}

export async function getPublicIndex(): Promise<PublicIndex> {
  const categories = await getCategories()
  const publicCategories = categories
    .filter(c => c.visibility === 'public')
    .map(category => ({
      category,
      articles: category.articles.filter(a => a.effectiveVisibility === 'public'),
    }))
    .filter(c => c.articles.length > 0)

  const tags = isTagsEnabled()
    ? (await getTagUsage().catch(() => []))
        .filter(t => t.publicCount >= MIN_TAG_ARTICLES)
        .map(t => ({ slug: t.slug, name: t.name }))
    : []

  return { categories: publicCategories, tags }
}

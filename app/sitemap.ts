import type { MetadataRoute } from 'next'
import { getPublicIndex } from '@/lib/publicIndex'
import { SITE_URL, absoluteUrl, articlePath } from '@/lib/seo'

// Built per request (cached at the edge by Cloudflare), never at `next build` — the
// DigitalOcean build containers have no database access.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 }]
  try {
    const { categories, tags } = await getPublicIndex()
    const latest = (iso: string[]) => iso.filter(Boolean).sort().at(-1)
    return [
      ...home,
      ...categories.map(({ category, articles }) => ({
        url: absoluteUrl(`/categories/${category.slug}`),
        lastModified: latest(articles.map(a => a.updatedAtIso)),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...categories.flatMap(({ articles }) =>
        articles.map(a => ({
          url: absoluteUrl(articlePath(a.categorySlug, a.slug)),
          lastModified: a.updatedAtIso || undefined,
          changeFrequency: 'monthly' as const,
          priority: 0.8,
        }))
      ),
      ...tags.map(t => ({ url: absoluteUrl(`/tags/${t.slug}`), changeFrequency: 'weekly' as const, priority: 0.5 })),
    ]
  } catch (err) {
    console.error('[sitemap]', err)
    return home
  }
}

import type { MetadataRoute } from 'next'
import { AI_CRAWLERS, PRIVATE_PATHS, SITE_URL } from '@/lib/seo'

// Search engines and AI answer engines may read every public page. Staff, auth and API
// paths are off limits, except /api/tags (the public tag vocabulary). Members-only
// articles redirect anonymous visitors to /login and carry noindex, so they never surface.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ['/', '/api/tags', '/llms.txt', '/llms-full.txt'], disallow: PRIVATE_PATHS },
      // Named explicitly so AI search stays allowed even if the catch-all is tightened later
      { userAgent: AI_CRAWLERS, allow: ['/', '/llms.txt', '/llms-full.txt'], disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}

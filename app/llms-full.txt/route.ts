import { extractHero } from '@/components/heroImage'
import { getPublicIndex } from '@/lib/publicIndex'
import { SITE_NAME, SITE_URL, absoluteUrl, articlePath, htmlToMarkdown } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/**
 * GET /llms-full.txt — every public article as markdown in one file (llmstxt.org
 * convention), so an AI assistant can read the whole public KB in one request. Each
 * article starts with its canonical URL and last-updated date for citation.
 */
export async function GET() {
  const out = [`# ${SITE_NAME} — full text`, '', `Source: ${SITE_URL}/ · Publisher: Nuvho (https://nuvho.com)`, '']
  try {
    const { categories } = await getPublicIndex()
    for (const { category, articles } of categories) {
      for (const a of articles) {
        const url = absoluteUrl(articlePath(a.categorySlug, a.slug))
        out.push(
          '---', '',
          `# ${a.title}`, '',
          `URL: ${url}`,
          `Category: ${category.title}`,
          ...(a.updatedAtIso ? [`Last updated: ${a.updatedAtIso}`] : []),
          '',
          `> ${a.description}`, '',
          htmlToMarkdown(extractHero(a.content).body),
          '',
        )
      }
    }
  } catch (err) {
    console.error('[llms-full.txt]', err)
  }
  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=3600' },
  })
}

import { getPublicIndex } from '@/lib/publicIndex'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl, articlePath } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/**
 * GET /llms.txt — the llmstxt.org index of the public Knowledge Base: one markdown link
 * per public article, grouped by category, with its one-line description. AI assistants
 * and answer engines use it to find the right page to read and cite.
 */
export async function GET() {
  const lines = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Official help articles from Nuvho (https://nuvho.com), a hospitality technology and services company working with hotels across Australia, New Zealand, the UK and Europe. Each link is the canonical article page; ${SITE_URL}/llms-full.txt has the full text of every article.`,
    '',
  ]
  try {
    const { categories, tags } = await getPublicIndex()
    for (const { category, articles } of categories) {
      lines.push(`## ${category.title}`, '')
      if (category.description) lines.push(category.description, '')
      for (const a of articles) {
        lines.push(`- [${a.title}](${absoluteUrl(articlePath(a.categorySlug, a.slug))}): ${a.description}`)
      }
      lines.push('')
    }
    if (tags.length) {
      lines.push('## Optional', '')
      for (const t of tags) lines.push(`- [${t.name}](${absoluteUrl(`/tags/${t.slug}`)}): articles tagged ${t.name}`)
      lines.push('')
    }
  } catch (err) {
    console.error('[llms.txt]', err)
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=3600' },
  })
}

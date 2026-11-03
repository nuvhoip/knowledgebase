import pool from '@/lib/db'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { VALID_TIERS, Tier, isTierConfigured, getVectorPool } from '@/lib/vectorTiers'

/**
 * Claude → Knowledge Base approval queue.
 *
 * Content saved from Claude lands in a Nuvho Vector DB (via the nuvho-knowledge-save skill).
 * Entries the user marked Public carry metadata.kb_publish = true. This module turns those
 * entries into PENDING articles so an admin can approve (publish) or deny (delete) them.
 *
 * Two entry points share createPendingArticle():
 *   - push: POST /api/admin/ingest (Claude submits straight away)
 *   - pull: importFromVectorDBs() — scans every configured tier for kb_publish entries that
 *           were never submitted (safety net + backfill). Run from the admin dashboard or
 *           POST /api/admin/claude-sync.
 * nuvho_kb.vector_imports remembers every (tier, source id) ever submitted, so the two paths
 * never duplicate each other and a denied article is never re-imported.
 */

export const INBOX_CATEGORY = 'claude-inbox'
export const INBOX_SUBCATEGORY = 'claude-inbox-general'

export type SubmitVia = 'claude-push' | 'claude-pull' | 'admin'

export interface PendingArticleInput {
  title: string
  description?: string
  content?: string            // HTML, markdown-lite or plain text
  categorySlug?: string       // falls back to the Claude Inbox when missing/unknown
  subcategorySlug?: string
  visibility?: 'public' | 'private' | null
  readTime?: number
  sourceTier?: Tier
  sourceVectorId?: string
  submittedBy: string
  via: SubmitVia
  /** When false, an unknown categorySlug is an error instead of falling back to the inbox. */
  fallbackToInbox?: boolean
}

export type PendingArticleResult =
  | { created: true; slug: string; categorySlug: string; subcategorySlug: string; inbox: boolean }
  | { created: false; reason: 'already-submitted' | 'category-not-found' | 'subcategory-not-found' | 'no-subcategory' | 'invalid-title'; categorySlug?: string; slug?: string }

// ── Text helpers ─────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function looksLikeHtml(s: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|div|table|br)\b[^>]*>/i.test(s)
}

/** Converts plain text / light markdown (headings, bullet & numbered lists, bold, code) to HTML. */
export function textToHtml(text: string): string {
  if (!text?.trim()) return ''
  if (looksLikeHtml(text)) return text
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trimEnd()).filter(l => l.trim())
    if (!lines.length) return ''
    const h = /^(#{1,4})\s+(.*)$/.exec(lines[0])
    if (h && lines.length === 1) {
      const level = h[1].length <= 2 ? 2 : 3
      return `<h${level}>${inline(h[2])}</h${level}>`
    }
    if (lines.every(l => /^\s*[-*•]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`
    }
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`
    }
    if (h) {
      const level = h[1].length <= 2 ? 2 : 3
      return `<h${level}>${inline(h[2])}</h${level}><p>${lines.slice(1).map(inline).join('<br>')}</p>`
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`
  }).filter(Boolean).join('\n')
}

/** First sentence(s) of the plain text, capped for the article card. */
export function deriveDescription(content: string, max = 200): string {
  const plain = stripHtml(textToHtml(content)).replace(/^#+\s*/, '')
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, '') + '…'
}

/** Joins fixed-size chunks back together, removing the word overlap between neighbours. */
export function joinChunks(chunks: string[]): string {
  if (chunks.length <= 1) return chunks[0] ?? ''
  let words = chunks[0].split(/\s+/).filter(Boolean)
  for (const chunk of chunks.slice(1)) {
    const next = chunk.split(/\s+/).filter(Boolean)
    let overlap = 0
    for (let k = Math.min(400, words.length, next.length); k > 0; k--) {
      let same = true
      for (let i = 0; i < k; i++) {
        if (words[words.length - k + i] !== next[i]) { same = false; break }
      }
      if (same) { overlap = k; break }
    }
    words = words.concat(next.slice(overlap))
  }
  return words.join(' ')
}

// ── Create a pending article ────────────────────────────────────────────────

export async function createPendingArticle(input: PendingArticleInput): Promise<PendingArticleResult> {
  const title = input.title?.trim()
  if (!title) return { created: false, reason: 'invalid-title' }
  const baseSlug = slugify(title)
  if (!baseSlug) return { created: false, reason: 'invalid-title' }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (input.sourceTier && input.sourceVectorId) {
      const seen = await client.query(
        `SELECT category_slug, article_slug FROM nuvho_kb.vector_imports
         WHERE source_tier = $1 AND source_vector_id = $2 FOR UPDATE`,
        [input.sourceTier, input.sourceVectorId]
      )
      if (seen.rowCount) {
        await client.query('ROLLBACK')
        return { created: false, reason: 'already-submitted', categorySlug: seen.rows[0].category_slug, slug: seen.rows[0].article_slug }
      }
    }

    // ── Resolve category + sub-category (unknown → Claude Inbox when allowed) ──
    const fallback = input.fallbackToInbox !== false
    let categorySlug = input.categorySlug?.trim() || ''
    let subcategorySlug = input.subcategorySlug?.trim() || ''
    let inbox = false

    if (categorySlug) {
      const cat = await client.query('SELECT slug FROM nuvho_kb.categories WHERE slug = $1', [categorySlug])
      if (!cat.rowCount) {
        if (!fallback) { await client.query('ROLLBACK'); return { created: false, reason: 'category-not-found' } }
        categorySlug = ''
        subcategorySlug = ''
      }
    }
    if (!categorySlug) {
      categorySlug = INBOX_CATEGORY
      subcategorySlug = INBOX_SUBCATEGORY
      inbox = true
    }

    if (subcategorySlug) {
      const sub = await client.query(
        'SELECT slug FROM nuvho_kb.subcategories WHERE slug = $1 AND category_slug = $2',
        [subcategorySlug, categorySlug]
      )
      if (!sub.rowCount) {
        if (!fallback) { await client.query('ROLLBACK'); return { created: false, reason: 'subcategory-not-found' } }
        subcategorySlug = ''
      }
    }
    if (!subcategorySlug) {
      const def = await client.query(
        'SELECT slug FROM nuvho_kb.subcategories WHERE category_slug = $1 ORDER BY sort_order, title LIMIT 1',
        [categorySlug]
      )
      if (!def.rowCount) { await client.query('ROLLBACK'); return { created: false, reason: 'no-subcategory' } }
      subcategorySlug = def.rows[0].slug
    }

    // ── Unique slug within the category ──
    let slug = baseSlug
    for (let n = 2; ; n++) {
      const clash = await client.query(
        'SELECT 1 FROM nuvho_kb.articles WHERE category_slug = $1 AND slug = $2',
        [categorySlug, slug]
      )
      if (!clash.rowCount) break
      slug = `${baseSlug}-${n}`
    }

    const html = textToHtml(input.content ?? '')
    const description = input.description?.trim() || deriveDescription(input.content ?? title)
    const order = (await client.query(
      'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM nuvho_kb.articles WHERE category_slug = $1',
      [categorySlug]
    )).rows[0].next
    const wordCount = stripHtml(html).split(/\s+/).filter(Boolean).length
    const readTime = Number(input.readTime) || Math.max(1, Math.round(wordCount / 200))

    await client.query(
      `INSERT INTO nuvho_kb.articles
         (slug, title, description, category_slug, subcategory_slug, content, read_time, featured,
          sort_order, status, visibility, source_tier, source_vector_id, submitted_by, submitted_via, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,'pending',$9,$10,$11,$12,$13,NOW())`,
      [slug, title, description || title, categorySlug, subcategorySlug, sanitizeArticleHtml(html),
       readTime, order, input.visibility ?? null, input.sourceTier ?? null, input.sourceVectorId ?? null,
       input.submittedBy, input.via]
    )

    if (input.sourceTier && input.sourceVectorId) {
      await client.query(
        `INSERT INTO nuvho_kb.vector_imports
           (source_tier, source_vector_id, category_slug, article_slug, submitted_via, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.sourceTier, input.sourceVectorId, categorySlug, slug, input.via, input.submittedBy]
      )
    }

    await client.query('COMMIT')
    return { created: true, slug, categorySlug, subcategorySlug, inbox }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ── Pull: scan the vector DBs for kb_publish entries ─────────────────────────

export interface ImportSummary {
  imported: { tier: Tier; sourceId: string; title: string; categorySlug: string; slug: string }[]
  skipped: number
  errors: { tier: Tier; error: string }[]
  tiersScanned: Tier[]
  tiersNotConfigured: Tier[]
}

interface VectorRow {
  id: number
  content: string
  source_id: string | null
  metadata: Record<string, any> | null
}

export async function importFromVectorDBs(runBy: string): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: [], skipped: 0, errors: [], tiersScanned: [], tiersNotConfigured: [] }

  for (const tier of VALID_TIERS) {
    if (!isTierConfigured(tier)) { summary.tiersNotConfigured.push(tier); continue }
    summary.tiersScanned.push(tier)

    const vpool = getVectorPool(tier)
    try {
      const { rows } = await vpool.query<VectorRow>(
        `SELECT id, content, source_id, metadata
           FROM embeddings
          WHERE metadata->>'kb_publish' = 'true'
          ORDER BY source_id NULLS LAST,
                   COALESCE(NULLIF(metadata->>'chunk_index', '')::int, 0),
                   id`
      )

      // Group chunks of the same document (same source_id); rows without a source_id stand alone.
      const docs = new Map<string, VectorRow[]>()
      for (const r of rows) {
        const key = r.source_id?.trim() || `vec-${r.id}`
        const list = docs.get(key) ?? []
        list.push(r)
        docs.set(key, list)
      }

      const logged = await pool.query(
        'SELECT source_vector_id FROM nuvho_kb.vector_imports WHERE source_tier = $1',
        [tier]
      )
      const already = new Set<string>(logged.rows.map(r => r.source_vector_id))

      for (const [sourceId, chunks] of Array.from(docs.entries())) {
        if (already.has(sourceId)) { summary.skipped++; continue }
        const meta = chunks[0].metadata ?? {}
        const content = joinChunks(chunks.map(c => c.content))
        const title = String(meta.title ?? '').trim() || deriveDescription(content, 80)
        const visibility = meta.visibility === 'internal' ? 'private' : meta.visibility === 'public' ? 'public' : null
        try {
          const res = await createPendingArticle({
            title,
            content,
            categorySlug: meta.kb_category,
            subcategorySlug: meta.kb_subcategory,
            visibility,
            sourceTier: tier,
            sourceVectorId: sourceId,
            submittedBy: String(meta.saved_by ?? meta.ingested_by ?? runBy),
            via: 'claude-pull',
          })
          if (res.created) summary.imported.push({ tier, sourceId, title, categorySlug: res.categorySlug, slug: res.slug })
          else summary.skipped++
        } catch (err: any) {
          summary.errors.push({ tier, error: `${sourceId}: ${err?.message ?? 'insert failed'}` })
        }
      }
    } catch (err: any) {
      console.error(`[claude-import] ${tier} scan failed`, err)
      summary.errors.push({ tier, error: err?.message ?? 'scan failed' })
    } finally {
      await vpool.end().catch(() => {})
    }
  }
  return summary
}

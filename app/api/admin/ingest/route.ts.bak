import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

/**
 * POST /api/admin/ingest
 *
 * Saves ingested content (from Vector MCP or external sources) as a PENDING
 * article in the knowledgebase. An admin must publish it before it appears
 * on the public site.
 *
 * Optionally also writes an embedding to the tier-specific vector DB if the
 * matching VECTOR_DB_*_URL env var and OPENAI_API_KEY are configured.
 *
 * Body:
 *   title        string  required
 *   description  string  required
 *   categorySlug string  required
 *   content      string  optional  (HTML or markdown)
 *   readTime     number  optional  (minutes, default 5)
 *   sourceId     string  optional  (vector source_id for cross-reference)
 *   sourceTier   string  optional  ('domain'|'internal'|'client'|'confidential')
 *   ingestToVector boolean optional (default false — set true to also embed)
 */

const VALID_TIERS = ['domain', 'internal', 'client', 'confidential'] as const
type Tier = (typeof VALID_TIERS)[number]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const TIER_ENV_VARS: Record<Tier, string> = {
  client:       'VECTOR_DB_CLIENT_URL',
  confidential: 'VECTOR_DB_CONFIDENTIAL_URL',
  domain:       'VECTOR_DB_DOMAIN_URL',
  internal:     'VECTOR_DB_INTERNAL_URL',
}

function getVectorPool(tier: Tier): Pool {
  const envKey = TIER_ENV_VARS[tier]
  const url = process.env[envKey]
  if (!url) throw new Error(`${envKey} is not configured for tier '${tier}'.`)
  return new Pool({ connectionString: url, max: 3 })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    title,
    description,
    categorySlug,
    content,
    readTime,
    sourceId,
    sourceTier,
    ingestToVector = false,
    // Client tier extras — hgid is required when sourceTier is 'client'
    hgid,
    pid,
    eid,
    entityCode,
  } = body

  // ── Validate required fields ──────────────────────────────────────────────
  if (!title?.trim() || !description?.trim() || !categorySlug?.trim()) {
    return NextResponse.json(
      { error: 'title, description and categorySlug are required.' },
      { status: 400 }
    )
  }

  const tier: Tier | undefined = sourceTier
  if (ingestToVector && tier && !VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: `sourceTier must be one of: ${VALID_TIERS.join(', ')}.` },
      { status: 400 }
    )
  }

  if (ingestToVector && tier === 'client' && !hgid?.trim()) {
    return NextResponse.json(
      { error: 'hgid (Hotel Group ID) is required when ingesting to the client tier.' },
      { status: 400 }
    )
  }

  // ── Verify category exists ────────────────────────────────────────────────
  const catCheck = await pool.query(
    'SELECT slug FROM nuvho_kb.categories WHERE slug = $1',
    [categorySlug.trim()]
  )
  if (catCheck.rowCount === 0) {
    return NextResponse.json({ error: 'Category not found.' }, { status: 404 })
  }

  const slug = slugify(title.trim())
  if (!slug) {
    return NextResponse.json(
      { error: 'Could not generate a valid slug from that title.' },
      { status: 400 }
    )
  }

  // ── Insert article as PENDING ─────────────────────────────────────────────
  const maxRes = await pool.query(
    'SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM nuvho_kb.articles WHERE category_slug = $1',
    [categorySlug.trim()]
  )
  const order = maxRes.rows[0].next

  try {
    await pool.query(
      `INSERT INTO nuvho_kb.articles
         (slug, title, description, category_slug, content, read_time, featured, sort_order, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, 'pending', NOW())`,
      [
        slug,
        title.trim(),
        description.trim(),
        categorySlug.trim(),
        content || null,
        Number(readTime) || 5,
        order,
      ]
    )
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json(
        { error: 'An article with that title already exists in this category.' },
        { status: 409 }
      )
    }
    console.error('[admin/ingest] KB insert error', err)
    return NextResponse.json({ error: 'Failed to save article to knowledge base.' }, { status: 500 })
  }

  // ── Optionally embed into vector DB ──────────────────────────────────────
  let vectorResult: { success: boolean; sourceId?: string; error?: string } = { success: false }

  if (ingestToVector && tier) {
    const rawContent = [title.trim(), description.trim(), content ? stripHtml(content) : '']
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 8000)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      vectorResult = { success: false, error: 'OPENAI_API_KEY not configured — skipped vector ingestion.' }
    } else {
      try {
        const oaiRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'text-embedding-3-large', dimensions: 1536, input: rawContent }),
        })
        if (!oaiRes.ok) {
          vectorResult = { success: false, error: 'OpenAI embedding request failed.' }
        } else {
          const oaiData = await oaiRes.json()
          const embedding: number[] = oaiData.data[0].embedding
          const embeddingStr = `[${embedding.join(',')}]`
          const vid = sourceId || `kb:${categorySlug.trim()}/${slug}`
          const metadata = {
            title: title.trim(),
            category_slug: categorySlug.trim(),
            slug,
            ingested_by: session.email,
            ingested_at: new Date().toISOString(),
            kb_status: 'pending',
          }

          let vectorPool: Pool | null = null
          try {
            vectorPool = getVectorPool(tier)
            await vectorPool.query(
              `DELETE FROM embeddings WHERE source_type = $1 AND source_id = $2`,
              [tier, vid]
            )

            // The client tier DB has extra NOT NULL columns (hgid, pid, eid, entity_code)
            if (tier === 'client') {
              await vectorPool.query(
                `INSERT INTO embeddings
                   (content, embedding, source_type, source_id, hgid, pid, eid, entity_code, doc_status, metadata, created_at)
                 VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8, 'published', $9::jsonb, NOW())`,
                [rawContent, embeddingStr, tier, vid, hgid?.trim(), pid?.trim() ?? null, eid?.trim() ?? null, entityCode?.trim() ?? null, JSON.stringify(metadata)]
              )
            } else {
              await vectorPool.query(
                `INSERT INTO embeddings (content, embedding, source_type, source_id, doc_status, metadata, created_at)
                 VALUES ($1, $2::vector, $3, $4, 'published', $5::jsonb, NOW())`,
                [rawContent, embeddingStr, tier, vid, JSON.stringify(metadata)]
              )
            }

            vectorResult = { success: true, sourceId: vid }
            // Record where this article was synced
            await pool.query(
              `UPDATE nuvho_kb.articles SET vector_tier = $1, vector_synced_at = NOW()
               WHERE category_slug = $2 AND slug = $3`,
              [tier, categorySlug.trim(), slug]
            )
          } finally {
            if (vectorPool) await vectorPool.end().catch(() => {})
          }
        }
      } catch (err) {
        console.error('[admin/ingest] vector error', err)
        vectorResult = { success: false, error: 'Vector DB write failed — article still saved to KB.' }
      }
    }
  }

  return NextResponse.json({
    success: true,
    slug,
    categorySlug: categorySlug.trim(),
    status: 'pending',
    message: 'Article saved as pending. An admin must publish it before it appears on the site.',
    vector: ingestToVector ? vectorResult : undefined,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import pool from '@/lib/db'
import { getSession } from '@/lib/auth'

interface RouteParams {
  params: { categorySlug: string; slug: string }
}

const VALID_TIERS = ['domain', 'internal', 'client', 'confidential'] as const
type Tier = (typeof VALID_TIERS)[number]

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession()
  if (!session || !session.email.endsWith('@nuvho.com')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const tier: Tier = body.tier
  // Client tier requires hgid; pid, eid, entityCode are optional
  const hgid: string | undefined = body.hgid?.trim() || undefined
  const pid: string | undefined = body.pid?.trim() || undefined
  const eid: string | undefined = body.eid?.trim() || undefined
  const entityCode: string | undefined = body.entityCode?.trim() || undefined

  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}.` },
      { status: 400 }
    )
  }

  if (tier === 'client' && !hgid) {
    return NextResponse.json(
      { error: 'hgid (Hotel Group ID) is required when syncing to the client tier.' },
      { status: 400 }
    )
  }

  const articleRes = await pool.query(
    `SELECT title, description, content FROM nuvho_kb.articles
     WHERE category_slug = $1 AND slug = $2`,
    [params.categorySlug, params.slug]
  )
  if (articleRes.rowCount === 0) {
    return NextResponse.json({ error: 'Article not found.' }, { status: 404 })
  }
  const article = articleRes.rows[0]

  const rawContent = [
    article.title,
    article.description,
    article.content ? stripHtml(article.content) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured on the server.' }, { status: 500 })
  }

  let embedding: number[]
  try {
    const oaiRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-large', dimensions: 1536, input: rawContent }),
    })
    if (!oaiRes.ok) {
      console.error('[sync] OpenAI error', await oaiRes.json().catch(() => ({})))
      return NextResponse.json({ error: 'OpenAI embedding request failed.' }, { status: 502 })
    }
    const oaiData = await oaiRes.json()
    embedding = oaiData.data[0].embedding as number[]
  } catch (err) {
    console.error('[sync] OpenAI fetch failed', err)
    return NextResponse.json({ error: 'Could not reach the OpenAI API.' }, { status: 502 })
  }

  const sourceId = `kb:${params.categorySlug}/${params.slug}`
  const metadata = {
    title: article.title,
    category_slug: params.categorySlug,
    slug: params.slug,
    synced_by: session.email,
    synced_at: new Date().toISOString(),
  }
  const embeddingStr = `[${embedding.join(',')}]`

  let vectorPool: Pool | null = null
  try {
    vectorPool = getVectorPool(tier)
    await vectorPool.query(
      `DELETE FROM embeddings WHERE source_type = $1 AND source_id = $2`,
      [tier, sourceId]
    )

    // The client tier DB has extra NOT NULL columns (hgid, pid, eid, entity_code)
    if (tier === 'client') {
      await vectorPool.query(
        `INSERT INTO embeddings
           (content, embedding, source_type, source_id, hgid, pid, eid, entity_code, doc_status, metadata, created_at)
         VALUES ($1, $2::vector, $3, $4, $5, $6, $7, $8, 'published', $9::jsonb, NOW())`,
        [rawContent, embeddingStr, tier, sourceId, hgid, pid ?? null, eid ?? null, entityCode ?? null, JSON.stringify(metadata)]
      )
    } else {
      await vectorPool.query(
        `INSERT INTO embeddings (content, embedding, source_type, source_id, doc_status, metadata, created_at)
         VALUES ($1, $2::vector, $3, $4, 'published', $5::jsonb, NOW())`,
        [rawContent, embeddingStr, tier, sourceId, JSON.stringify(metadata)]
      )
    }

    // Record where this article was synced so the admin dashboard can show it
    await pool.query(
      `UPDATE nuvho_kb.articles SET vector_tier = $1, vector_synced_at = NOW()
       WHERE category_slug = $2 AND slug = $3`,
      [tier, params.categorySlug, params.slug]
    )
    return NextResponse.json({ success: true, tier, sourceId })
  } catch (err) {
    console.error('[sync] Vector DB error', err)
    return NextResponse.json({ error: 'Failed to write to the vector database.' }, { status: 500 })
  } finally {
    if (vectorPool) await vectorPool.end().catch(() => {})
  }
}

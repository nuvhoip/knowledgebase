// Article tags (UI name "Tags"). Stored in nuvho_kb.topics / nuvho_kb.article_topics — the
// tables from handover C (docs/handover/2026-10-kb-db-changes-for-glenn.md), applied to
// production on 30 Oct 2026. "Tags" in the UI avoids a clash with the header's "Topics"
// menu, which lists categories; the DB keeps the `topics` name.
//
// Writes run whenever the tables exist (so tags sent by the nuvho-knowledge-save skill are
// kept from day one). Everything readers see — chips, tag pages, related articles, tags in
// search, sitemap and JSON-LD — sits behind KB_TAGS_ENABLED (lib/flags.ts).

import type { Db } from './versions'

export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 40

export interface Tag {
  slug: string
  name: string
}

/** URL slug for a tag name: "Rate Parity & OTAs" → "rate-parity-and-otas". */
export function tagSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

/**
 * Cleans tags from any caller (editor, ingest API, vector metadata): accepts an array or a
 * comma/semicolon/newline separated string, drops a leading "#", collapses whitespace,
 * caps length and count, and de-duplicates by slug (first spelling wins).
 */
export function normalizeTags(input: unknown): Tag[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,;\n]/)
      : []
  const out: Tag[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = item.replace(/^\s*#/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
    const slug = tagSlug(name)
    if (!name || !slug || seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, name })
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Splits what an editor typed ("Booking Engine, SEO") into names; the server cleans them further. */
export function splitTagText(text: string): string[] {
  return text.split(/[,;\n]/).map(t => t.trim()).filter(Boolean)
}

let tablesExist = false

/** True once nuvho_kb.topics and nuvho_kb.article_topics exist (cached after the first yes). */
export async function hasTagTables(db: Db): Promise<boolean> {
  if (tablesExist) return true
  const res = await db.query(
    `SELECT to_regclass('nuvho_kb.topics') IS NOT NULL AND to_regclass('nuvho_kb.article_topics') IS NOT NULL AS ok`
  )
  tablesExist = !!res.rows[0]?.ok
  return tablesExist
}

/**
 * Replaces an article's tags with `input` (creating tags that don't exist yet; an existing
 * tag keeps its stored spelling). Call inside the save's transaction. Returns the tags
 * written, or null when the tag tables don't exist (the save itself still succeeds).
 */
export async function setArticleTags(db: Db, articleId: number, input: unknown): Promise<Tag[] | null> {
  if (!(await hasTagTables(db))) return null
  const tags = normalizeTags(input)
  const ids: number[] = []
  const written: Tag[] = []
  for (const t of tags) {
    const res = await db.query(
      `INSERT INTO nuvho_kb.topics (slug, name) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
       RETURNING id, slug, name`,
      [t.slug, t.name]
    )
    ids.push(res.rows[0].id)
    written.push({ slug: res.rows[0].slug, name: res.rows[0].name })
  }
  await db.query(
    'DELETE FROM nuvho_kb.article_topics WHERE article_id = $1 AND NOT (topic_id = ANY($2::int[]))',
    [articleId, ids]
  )
  if (ids.length) {
    await db.query(
      `INSERT INTO nuvho_kb.article_topics (article_id, topic_id)
       SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [articleId, ids]
    )
  }
  return written
}

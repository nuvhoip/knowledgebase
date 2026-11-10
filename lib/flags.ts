// Feature flags. Read at runtime from the environment (like the AZURE_* settings), so they
// can be switched on App Platform without a rebuild. Off unless set to exactly "true".
// Server-side only: pages pass the result down to client components as a prop.
// (The image library has no flag: it appears once photos are imported — lib/imageLibraryDb.ts.)

/**
 * Article version history and restore (Pass 4). Needs the nuvho_kb.article_versions table
 * from docs/handover/2026-10-kb-db-changes-for-glenn.md — switch on only after it exists.
 */
export function isVersioningEnabled(): boolean {
  return process.env.KB_VERSIONING_ENABLED === 'true'
}

/**
 * Article tags shown to readers: chips on articles, /tags/[slug] pages, related articles,
 * tags in search, the sitemap and JSON-LD, plus the Tags field in the editor. Uses
 * nuvho_kb.topics / nuvho_kb.article_topics (handover C, applied 30 Oct 2026). Tags sent by
 * Claude are stored whenever those tables exist, even while this flag is off (lib/tags.ts).
 */
export function isTagsEnabled(): boolean {
  return process.env.KB_TAGS_ENABLED === 'true'
}

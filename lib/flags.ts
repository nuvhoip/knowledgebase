// Feature flags. Read at runtime from the environment (like the AZURE_* settings), so they
// can be switched on App Platform without a rebuild. Off unless set to exactly "true".
// Server-side only: pages pass the result down to client components as a prop.

/**
 * Article version history and restore (Pass 4). Needs the nuvho_kb.article_versions table
 * from docs/handover/2026-10-kb-db-changes-for-glenn.md — switch on only after it exists.
 */
export function isVersioningEnabled(): boolean {
  return process.env.KB_VERSIONING_ENABLED === 'true'
}

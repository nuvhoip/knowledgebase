import { NextRequest, NextResponse } from 'next/server'
import { getIngestActor } from '@/lib/ingestAuth'
import { importFromVectorDBs } from '@/lib/claudeImport'

/**
 * POST /api/admin/claude-sync
 *
 * Scans every configured Nuvho Vector DB tier for entries saved from Claude with
 * metadata.kb_publish = true that have not been submitted yet, and creates them as
 * PENDING articles for admin review. Safe to run repeatedly — each vector entry is
 * imported at most once (see nuvho_kb.vector_imports), and denied (deleted) articles
 * are never re-imported.
 *
 * Auth: staff session (admin dashboard) or Bearer KB_INGEST_API_KEYS + X-Submitted-By
 * (e.g. a scheduled job).
 */
export async function POST(req: NextRequest) {
  const actor = await getIngestActor(req)
  if (!actor) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

  try {
    const summary = await importFromVectorDBs(actor.email)
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('[claude-sync] failed', err)
    return NextResponse.json({ error: 'Claude sync failed.' }, { status: 500 })
  }
}

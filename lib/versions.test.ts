import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  Db, VersionNotFoundError, ensureBaseline, getLatestVersions, listVersions, lockArticle,
  restoreVersion, snapshotArticle, withDb,
} from './versions'

type Call = { sql: string; params: unknown[] }
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Records every query; `respond` returns rows for the queries a test cares about. */
function fakeDb(respond: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const calls: Call[] = []
  const db: Db = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      const sql = squash(text)
      calls.push({ sql, params })
      const rows = respond(sql, params)
      return { rows, rowCount: rows.length }
    }),
  }
  return { db, calls }
}

const versionRow = (n: number, over: Record<string, unknown> = {}) => ({
  version_number: n, title: `Title v${n}`, description: `Desc v${n}`, content: `<p>Body v${n}</p>`,
  category_slug: 'support', subcategory_slug: 'support-general', status: 'published', visibility: null,
  read_time: 4, featured: false, changed_by: 'jose@nuvho.com', changed_at: new Date('2026-10-14T03:00:00Z'),
  source: 'editor', change_summary: null, restored_from: null, ...over,
})

describe('withDb', () => {
  it('runs straight on the pool when versioning is off (no transaction)', async () => {
    const { db, calls } = fakeDb()
    const pool = Object.assign(db, { connect: vi.fn() }) as unknown as Pool
    await withDb(pool, false, d => d.query('SELECT 1'))
    expect(calls.map(c => c.sql)).toEqual(['SELECT 1'])
    expect((pool as unknown as { connect: unknown }).connect).not.toHaveBeenCalled()
  })

  it('wraps the work in BEGIN/COMMIT on one client', async () => {
    const { db: client, calls } = fakeDb()
    const release = vi.fn()
    const pool = { connect: vi.fn(async () => Object.assign(client, { release })) } as unknown as Pool
    const result = await withDb(pool, true, async d => { await d.query('UPDATE x'); return 42 })
    expect(result).toBe(42)
    expect(calls.map(c => c.sql)).toEqual(['BEGIN', 'UPDATE x', 'COMMIT'])
    expect(release).toHaveBeenCalledOnce()
  })

  it('rolls back and rethrows when the save or the snapshot fails', async () => {
    const { db: client, calls } = fakeDb()
    const release = vi.fn()
    const pool = { connect: vi.fn(async () => Object.assign(client, { release })) } as unknown as Pool
    await expect(withDb(pool, true, async () => { throw new Error('snapshot failed') })).rejects.toThrow('snapshot failed')
    expect(calls.map(c => c.sql)).toEqual(['BEGIN', 'ROLLBACK'])
    expect(release).toHaveBeenCalledOnce()
  })
})

describe('lockArticle', () => {
  it('locks the row FOR UPDATE and returns its id', async () => {
    const { db, calls } = fakeDb(() => [{ id: 7 }])
    expect(await lockArticle(db, 'support', 'faq')).toBe(7)
    expect(calls[0].sql).toMatch(/FOR UPDATE$/)
    expect(calls[0].params).toEqual(['support', 'faq'])
  })
  it('returns null for a missing article', async () => {
    const { db } = fakeDb(() => [])
    expect(await lockArticle(db, 'support', 'nope')).toBeNull()
  })
})

describe('ensureBaseline', () => {
  it('only inserts version 1 when the article has no history yet', async () => {
    const { db, calls } = fakeDb()
    await ensureBaseline(db, 7)
    expect(calls[0].sql).toContain("SELECT a.id, 1,")
    expect(calls[0].sql).toContain("'baseline'")
    expect(calls[0].sql).toContain('AND NOT EXISTS (SELECT 1 FROM nuvho_kb.article_versions v WHERE v.article_id = a.id)')
    expect(calls[0].params).toEqual([7])
  })
})

describe('snapshotArticle', () => {
  it('records the next version with who, why and where from', async () => {
    const { db, calls } = fakeDb(() => [{ version_number: 5 }])
    const n = await snapshotArticle(db, 7, { source: 'editor', changedBy: 'jose@nuvho.com', changeSummary: '  Fixed rates  ' })
    expect(n).toBe(5)
    expect(calls[0].sql).toContain('COALESCE(l.version_number, 0) + 1')
    expect(calls[0].params).toEqual([7, 'jose@nuvho.com', 'editor', 'Fixed rates', null, false])
  })

  it('skips unchanged saves unless forced, and says so by returning null', async () => {
    const { db, calls } = fakeDb(() => [])
    expect(await snapshotArticle(db, 7, { source: 'editor', changedBy: null })).toBeNull()
    expect(calls[0].sql).toContain('IS DISTINCT FROM')
    expect(calls[0].params[3]).toBeNull() // blank summary stored as NULL
  })

  it('copies every tracked column from the article row', async () => {
    const { db, calls } = fakeDb(() => [{ version_number: 1 }])
    await snapshotArticle(db, 7, { source: 'create', changedBy: 'a@nuvho.com' })
    for (const col of ['title', 'description', 'content', 'category_slug', 'subcategory_slug', 'status', 'visibility', 'read_time', 'featured']) {
      expect(calls[0].sql).toContain(`a.${col}`)
    }
  })
})

describe('restoreVersion', () => {
  it('restores content fields as a NEW version and never deletes history', async () => {
    const { db, calls } = fakeDb(sql => {
      if (sql.startsWith('SELECT version_number')) return [versionRow(2, { content: '<p>Old</p><script>alert(1)</script>', read_time: 3 })]
      if (sql.includes('$6::boolean')) return [{ version_number: 6 }] // the snapshot insert
      return []
    })
    const n = await restoreVersion(db, 7, 2, 'jose@nuvho.com')
    expect(n).toBe(6)

    const kinds = calls.map(c => c.sql.split(' ').slice(0, 3).join(' '))
    expect(kinds).toEqual([
      'SELECT version_number, title,',               // read version 2
      'INSERT INTO nuvho_kb.article_versions',       // baseline (no-op if history exists)
      'UPDATE nuvho_kb.articles SET',                // copy content fields
      'INSERT INTO nuvho_kb.article_versions',       // snapshot as the next version
    ])
    expect(calls.some(c => c.sql.startsWith('DELETE'))).toBe(false)

    const update = calls[2]
    expect(update.sql).toContain('SET title = $1, description = $2, content = $3, read_time = COALESCE($4, read_time)')
    expect(update.sql).not.toMatch(/status|category_slug|subcategory_slug|visibility|featured/)
    expect(update.params).toEqual(['Title v2', 'Desc v2', '<p>Old</p>', 3, 7]) // re-sanitised

    expect(calls[3].params).toEqual([7, 'jose@nuvho.com', 'restore', 'Restored version 2', 2, true])
  })

  it('throws VersionNotFoundError and writes nothing for an unknown version', async () => {
    const { db, calls } = fakeDb(() => [])
    await expect(restoreVersion(db, 7, 99, 'jose@nuvho.com')).rejects.toBeInstanceOf(VersionNotFoundError)
    expect(calls).toHaveLength(1)
  })
})

describe('reads', () => {
  it('lists versions newest first with ISO timestamps', async () => {
    const { db, calls } = fakeDb(() => [versionRow(3), versionRow(2, { source: 'backfill', changed_by: null })])
    const list = await listVersions(db, 7)
    expect(calls[0].sql).toContain('ORDER BY version_number DESC')
    expect(list[0]).toMatchObject({ versionNumber: 3, source: 'editor', changedAt: '2026-10-14T03:00:00.000Z' })
    expect(list[1]).toMatchObject({ versionNumber: 2, source: 'backfill', changedBy: null })
  })

  it('maps the latest version and editor per article for the index', async () => {
    const { db } = fakeDb(() => [{ article_id: 7, version_number: 4, changed_by: 'jose@nuvho.com' }, { article_id: 8, version_number: 1, changed_by: null }])
    const latest = await getLatestVersions(db)
    expect(latest.get(7)).toEqual({ version: 4, changedBy: 'jose@nuvho.com' })
    expect(latest.get(8)).toEqual({ version: 1, changedBy: null })
  })
})

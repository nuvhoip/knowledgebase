// Migration 011 (import with assets) — pre-flight check and apply, from a laptop.
//
//   node scripts/migrate-011.cjs check   read-only: what the database looks like, is it ready
//   node scripts/migrate-011.cjs apply   runs scripts/011_article_imports.sql in ONE transaction
//                                        (all or nothing), then verifies
//
// Uses DATABASE_URL (an already-set variable wins, else .env.local, else .env). For production
// that is the SSH tunnel on localhost:15432 — open it first. Back up the database before apply
// (docs/handover/2026-11-kb-html-asset-import.md, Rollout).

require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const mode = process.argv[2]
if (mode !== 'check' && mode !== 'apply') {
  console.error('Usage: node scripts/migrate-011.cjs check | apply')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (.env.local).')
  process.exit(2)
}

const target = (() => {
  try { const u = new URL(process.env.DATABASE_URL); return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}` } catch { return '(unparsable DATABASE_URL)' }
})()

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 })
const one = async (sql, params) => (await pool.query(sql, params)).rows[0]

async function check() {
  const v = await one(`SELECT current_user AS who, current_setting('server_version_num')::int AS num, version() AS version`)
  const canCreate = (await one(`SELECT has_schema_privilege(current_user, 'nuvho_kb', 'CREATE') AS ok`)).ok
  const cols = (await pool.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'nuvho_kb'
        AND ((table_name = 'articles' AND column_name IN ('id', 'status', 'submitted_by'))
          OR (table_name = 'uploads' AND column_name IN ('id', 'ext', 'mime')))
      ORDER BY table_name, column_name`)).rows
  const has = (t, c) => cols.find(r => r.table_name === t && r.column_name === c)
  const existing = await one(`SELECT to_regclass('nuvho_kb.article_imports') AS a, to_regclass('nuvho_kb.import_assets') AS b, to_regclass('nuvho_kb.api_tokens') AS c`)
  const role = (await one(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nuvho_kb_user') AS ok`)).ok

  const checks = [
    ['PostgreSQL 13 or newer (gen_random_uuid)', v.num >= 130000, v.version.split(',')[0]],
    ['nuvho_kb.articles.id is integer', has('articles', 'id')?.data_type === 'integer', has('articles', 'id')?.data_type ?? 'missing'],
    ['nuvho_kb.uploads.id is text', has('uploads', 'id')?.data_type === 'text', has('uploads', 'id')?.data_type ?? 'missing'],
    ['nuvho_kb.articles.submitted_by exists (migration 007)', !!has('articles', 'submitted_by'), has('articles', 'submitted_by') ? 'yes' : 'missing'],
    ['role nuvho_kb_user exists (GRANT target)', role, role ? 'yes' : 'missing'],
    [`${v.who} may create tables in nuvho_kb`, canCreate, canCreate ? 'yes' : 'no: run apply as postgres on the server instead'],
  ]
  console.log(`Database: ${target}\n`)
  for (const [label, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label} — ${detail}`)
  const already = [existing.a, existing.b, existing.c].filter(Boolean)
  console.log(`\n011 tables already present: ${already.length ? already.join(', ') : 'none'}`)
  return checks.every(([, ok]) => ok)
}

async function apply() {
  const ready = await check()
  if (!ready) {
    console.error('\nNot applying: fix the FAIL lines first.')
    process.exitCode = 1
    return
  }
  const sql = fs.readFileSync(path.join(__dirname, '011_article_imports.sql'), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('\nApplied 011_article_imports.sql (one transaction).')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`\nRolled back, nothing changed: ${err.message}`)
    process.exitCode = 1
    return
  } finally {
    client.release()
  }
  const after = await one(`SELECT to_regclass('nuvho_kb.article_imports') AS a, to_regclass('nuvho_kb.import_assets') AS b, to_regclass('nuvho_kb.api_tokens') AS c,
    has_table_privilege('nuvho_kb_user', 'nuvho_kb.api_tokens', 'INSERT') AS app_can_write,
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'nuvho_kb' AND table_name = 'import_assets' AND column_name = 'content_sha256') AS sha_col`)
  console.log(`Verify: tables ${[after.a, after.b, after.c].join(', ')}; app role can write: ${after.app_can_write}; content_sha256 column: ${after.sha_col === 1}`)
  if (!after.app_can_write) {
    console.error('The app role cannot write the new tables: run the GRANT line at the end of the .sql as postgres.')
    process.exitCode = 1
  }
}

;(mode === 'check' ? check().then(ok => { if (!ok) process.exitCode = 1 }) : apply())
  .catch(err => { console.error(`Error: ${err.message}`); process.exitCode = 1 })
  .finally(() => pool.end())

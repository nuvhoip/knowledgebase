import { createHash, randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import pool from '@/lib/db'
import { getSession, isStaffEmail } from '@/lib/auth'

// Personal import tokens (decision 24 Nov 2026): how the nuvho-knowledge-save skill sends a
// page to the KB without an MCP server. A staff member creates one in Admin → Claude tokens,
// sets it once as NUVHO_KB_TOKEN where Claude Code runs, and the skill uploads with curl.
//
//   - Format: nkb_<40 base62 chars>. Only its SHA-256 is stored; it is shown once.
//   - Scope 'import': upload a page / bundle and create or update a PENDING article. A token
//     can never publish, edit published articles or reach any other admin route.
//   - Expires (30, 90 or 365 days), can be revoked at any time, records when it was last used.
//   - Acts as its owner: articles are submitted by, and assets uploaded by, that email.

export const TOKEN_PREFIX = 'nkb_'
const TOKEN_RE = /^nkb_[A-Za-z0-9]{40}$/
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const TOKEN_LIFETIMES = [30, 90, 365] as const

let ready: boolean | null = null
let checkedAt = 0
export async function tokenTableReady(): Promise<boolean> {
  if (ready || (ready === false && Date.now() - checkedAt < 60_000)) return !!ready
  try {
    const r = await pool.query(`SELECT to_regclass('nuvho_kb.api_tokens') IS NOT NULL AS ok`)
    ready = !!r.rows[0]?.ok
  } catch {
    ready = false
  }
  checkedAt = Date.now()
  return ready
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function randomToken(): string {
  // Rejection sampling keeps every character uniformly likely
  let out = ''
  while (out.length < 40) {
    const bytes = randomBytes(64)
    for (let i = 0; i < bytes.length && out.length < 40; i++) {
      if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62]
    }
  }
  return TOKEN_PREFIX + out
}

export interface TokenInfo {
  id: string
  name: string
  prefix: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

function row(r: Record<string, any>): TokenInfo {
  return {
    id: r.id, name: r.name, prefix: r.token_prefix,
    createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
  }
}

export async function createToken(email: string, name: string, days: number): Promise<{ token: string; info: TokenInfo }> {
  const token = randomToken()
  const life = (TOKEN_LIFETIMES as readonly number[]).includes(days) ? days : 90
  const r = await pool.query(
    `INSERT INTO nuvho_kb.api_tokens (user_email, name, token_prefix, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5)) RETURNING *`,
    [email.toLowerCase(), name.trim().slice(0, 80) || 'Claude import', token.slice(0, 10), sha256(token), life],
  )
  return { token, info: row(r.rows[0]) }
}

export async function listTokens(email: string): Promise<TokenInfo[]> {
  const r = await pool.query(
    `SELECT * FROM nuvho_kb.api_tokens WHERE lower(user_email) = lower($1) ORDER BY created_at DESC LIMIT 50`,
    [email],
  )
  return r.rows.map(row)
}

export async function revokeToken(email: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false
  const r = await pool.query(
    `UPDATE nuvho_kb.api_tokens SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1 AND lower(user_email) = lower($2)`,
    [id, email],
  )
  return (r.rowCount ?? 0) > 0
}

/** The owner of a valid, unexpired, unrevoked token with the scope; null otherwise. */
export async function authenticateToken(token: string, scope = 'import'): Promise<string | null> {
  if (!TOKEN_RE.test(token) || !(await tokenTableReady())) return null
  const r = await pool.query(
    `UPDATE nuvho_kb.api_tokens SET last_used_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW() AND $2 = ANY(scopes)
      RETURNING user_email`,
    [sha256(token), scope],
  )
  const email: string | undefined = r.rows[0]?.user_email
  return email && isStaffEmail(email) ? email : null
}

export interface ImportActor {
  email: string
  via: 'editor' | 'token'
}

/** A staff session (editor) or a personal import token (Authorization: Bearer nkb_…). */
export async function getImportActor(req: NextRequest): Promise<ImportActor | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (/^bearer\s+/i.test(auth)) {
    const email = await authenticateToken(auth.replace(/^bearer\s+/i, '').trim())
    return email ? { email, via: 'token' } : null
  }
  const session = await getSession()
  return session && isStaffEmail(session.email) ? { email: session.email, via: 'editor' } : null
}

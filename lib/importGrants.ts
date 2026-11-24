import { createHash, randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import pool from '@/lib/db'
import { getSession, isStaffEmail } from '@/lib/auth'

// Import approvals (decision 24 Nov 2026, replacing personal tokens): how the
// nuvho-knowledge-save skill gets permission to send a page to the KB with nothing for the
// person to create, copy or set up.
//
//   1. The skill asks for permission: POST /api/import-grants (no sign-in). The KB answers
//      with a secret the skill keeps (nkg_…), a short code, and a link to the approval page.
//   2. The person opens the link in the browser where they are signed in to the KB, checks
//      the code is the one Claude showed, and clicks Approve.
//   3. The skill uploads with Authorization: Bearer nkg_…, as that person, for the rest of
//      the session (GRANT_HOURS). Then the grant is worthless.
//
//   - A grant can only upload a page / bundle and create or update a PENDING article
//     (POST /api/admin/import). It can never publish or reach any other admin route.
//   - Only the SHA-256 of the secret is stored. An unapproved request expires in
//     REQUEST_MINUTES. The person can end an approved grant from the approval page.

export const GRANT_PREFIX = 'nkg_'
export const REQUEST_MINUTES = 10
export const GRANT_HOURS = 8
/** Unapproved requests allowed at once: per address, and in total (the endpoint is public). */
export const MAX_PENDING_PER_IP = 5
export const MAX_PENDING_TOTAL = 200

const SECRET_RE = /^nkg_[A-Za-z0-9]{40}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// No 0/O, 1/I/L: the code is read by eye and compared
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

let ready: boolean | null = null
let checkedAt = 0
export async function grantTableReady(): Promise<boolean> {
  if (ready || (ready === false && Date.now() - checkedAt < 60_000)) return !!ready
  try {
    const r = await pool.query(`SELECT to_regclass('nuvho_kb.import_grants') IS NOT NULL AS ok`)
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

/** Uniform random string over an alphabet (rejection sampling). */
function randomString(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < length) {
    const bytes = randomBytes(length * 2)
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < limit) out += alphabet[bytes[i] % alphabet.length]
    }
  }
  return out
}

export type GrantStatus = 'pending' | 'approved' | 'denied' | 'expired'

export interface GrantView {
  id: string
  userCode: string
  label: string
  status: GrantStatus
  email: string | null
  createdAt: string
  expiresAt: string
}

function view(r: Record<string, any>): GrantView {
  const expired = new Date(r.expires_at).getTime() <= Date.now()
  return {
    id: r.id,
    userCode: r.user_code,
    label: r.client_label,
    status: r.status === 'denied' ? 'denied' : expired ? 'expired' : r.status,
    email: r.user_email ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
  }
}

export class GrantLimitError extends Error {}

/** A new, unapproved request. The secret is returned once and never stored. */
export async function requestGrant(label: string, ip: string): Promise<{ secret: string; grant: GrantView }> {
  // Housekeeping: nothing older than a day is of use to anyone
  await pool.query(`DELETE FROM nuvho_kb.import_grants WHERE expires_at < NOW() - INTERVAL '1 day'`)
  const busy = await pool.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE request_ip = $1)::int AS mine
       FROM nuvho_kb.import_grants WHERE status = 'pending' AND expires_at > NOW()`,
    [ip],
  )
  if (busy.rows[0].mine >= MAX_PENDING_PER_IP || busy.rows[0].total >= MAX_PENDING_TOTAL) {
    throw new GrantLimitError('Too many approval requests are waiting. Approve or wait for one to expire, then try again.')
  }
  const secret = GRANT_PREFIX + randomString(ALPHABET, 40)
  const code = randomString(CODE_ALPHABET, 8)
  const r = await pool.query(
    `INSERT INTO nuvho_kb.import_grants (secret_hash, user_code, client_label, request_ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5)) RETURNING *`,
    [sha256(secret), `${code.slice(0, 4)}-${code.slice(4)}`, cleanLabel(label), ip.slice(0, 64), REQUEST_MINUTES],
  )
  return { secret, grant: view(r.rows[0]) }
}

function cleanLabel(label: string): string {
  // Shown on the approval page: plain text only, short
  return label.replace(/[^\x20-\x7E]/g, '').replace(/[<>"'&]/g, '').trim().slice(0, 80)
}

/** For the approval page and its buttons. */
export async function getGrant(id: string): Promise<GrantView | null> {
  if (!UUID_RE.test(id)) return null
  const r = await pool.query(`SELECT * FROM nuvho_kb.import_grants WHERE id = $1`, [id])
  return r.rows[0] ? view(r.rows[0]) : null
}

/** What the skill polls with its secret. */
export async function grantStatus(secret: string): Promise<GrantView | null> {
  if (!SECRET_RE.test(secret) || !(await grantTableReady())) return null
  const r = await pool.query(`SELECT * FROM nuvho_kb.import_grants WHERE secret_hash = $1`, [sha256(secret)])
  return r.rows[0] ? view(r.rows[0]) : null
}

export type DecideResult = 'ok' | 'not-found' | 'expired' | 'already-decided' | 'not-yours'

/**
 * Approve or deny a waiting request (a signed-in staff member), or end a grant you approved.
 * Approving starts the session clock; a request can be decided once.
 */
export async function decideGrant(id: string, email: string, action: 'approve' | 'deny' | 'end'): Promise<DecideResult> {
  if (!UUID_RE.test(id) || !isStaffEmail(email)) return 'not-found'
  if (action === 'end') {
    const r = await pool.query(
      `UPDATE nuvho_kb.import_grants SET expires_at = NOW(), decided_at = NOW()
        WHERE id = $1 AND status = 'approved' AND lower(user_email) = lower($2) AND expires_at > NOW()`,
      [id, email],
    )
    if ((r.rowCount ?? 0) > 0) return 'ok'
    const g = await getGrant(id)
    return !g ? 'not-found' : g.status === 'approved' ? 'not-yours' : 'expired'
  }
  const r = await pool.query(
    action === 'approve'
      ? `UPDATE nuvho_kb.import_grants
            SET status = 'approved', user_email = lower($2), decided_at = NOW(),
                expires_at = NOW() + make_interval(hours => $3)
          WHERE id = $1 AND status = 'pending' AND expires_at > NOW()`
      : `UPDATE nuvho_kb.import_grants
            SET status = 'denied', user_email = lower($2), decided_at = NOW()
          WHERE id = $1 AND status = 'pending' AND expires_at > NOW() AND $3 > 0`,
    [id, email, GRANT_HOURS],
  )
  if ((r.rowCount ?? 0) > 0) return 'ok'
  const g = await getGrant(id)
  return !g ? 'not-found' : g.status === 'expired' ? 'expired' : 'already-decided'
}

/** The staff member behind an approved, unexpired grant; null otherwise. */
export async function authenticateGrant(secret: string): Promise<string | null> {
  if (!SECRET_RE.test(secret) || !(await grantTableReady())) return null
  const r = await pool.query(
    `UPDATE nuvho_kb.import_grants SET last_used_at = NOW()
      WHERE secret_hash = $1 AND status = 'approved' AND expires_at > NOW()
      RETURNING user_email`,
    [sha256(secret)],
  )
  const email: string | undefined = r.rows[0]?.user_email
  return email && isStaffEmail(email) ? email : null
}

export function bearer(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? ''
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : null
}

export interface ImportActor {
  email: string
  via: 'editor' | 'claude'
}

/** A staff session (the editor) or an approved import grant (Authorization: Bearer nkg_…). */
export async function getImportActor(req: NextRequest): Promise<ImportActor | null> {
  const secret = bearer(req)
  if (secret !== null) {
    const email = await authenticateGrant(secret)
    return email ? { email, via: 'claude' } : null
  }
  const session = await getSession()
  return session && isStaffEmail(session.email) ? { email: session.email, via: 'editor' } : null
}

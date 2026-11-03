import { Pool } from 'pg'

/**
 * The Nuvho Vector DB tiers the Knowledge Base can read from / write to.
 * Each tier is a separate pgvector database reached through its own connection URL.
 * A tier whose env var is unset is simply skipped by the Claude import.
 */
export const VALID_TIERS = ['domain', 'internal', 'client', 'confidential', 'support'] as const
export type Tier = (typeof VALID_TIERS)[number]

export const TIER_ENV_VARS: Record<Tier, string> = {
  client:       'VECTOR_DB_CLIENT_URL',
  confidential: 'VECTOR_DB_CONFIDENTIAL_URL',
  domain:       'VECTOR_DB_DOMAIN_URL',
  internal:     'VECTOR_DB_INTERNAL_URL',
  support:      'VECTOR_DB_SUPPORT_URL',
}

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (VALID_TIERS as readonly string[]).includes(value)
}

export function isTierConfigured(tier: Tier): boolean {
  return Boolean(process.env[TIER_ENV_VARS[tier]])
}

/** Opens a short-lived pool for one tier. Callers must `await pool.end()` when done. */
export function getVectorPool(tier: Tier): Pool {
  const envKey = TIER_ENV_VARS[tier]
  const url = process.env[envKey]
  if (!url) throw new Error(`${envKey} is not configured for tier '${tier}'.`)
  return new Pool({ connectionString: url, max: 3 })
}

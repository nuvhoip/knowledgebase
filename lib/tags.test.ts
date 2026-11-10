import { describe, it, expect } from 'vitest'
import { normalizeTags, tagSlug, setArticleTags, MAX_TAGS, type Tag } from './tags'
import type { Db } from './versions'

describe('tagSlug', () => {
  it('lower-cases, joins words with hyphens and spells out &', () => {
    expect(tagSlug('Rate Parity & OTAs')).toBe('rate-parity-and-otas')
  })
  it('strips accents and punctuation', () => {
    expect(tagSlug('  Café / Bar (F&B) ')).toBe('cafe-bar-f-and-b')
  })
})

describe('normalizeTags', () => {
  it('accepts a comma-separated string', () => {
    expect(normalizeTags('Booking Engine, #SEO ;  channel   manager')).toEqual<Tag[]>([
      { slug: 'booking-engine', name: 'Booking Engine' },
      { slug: 'seo', name: 'SEO' },
      { slug: 'channel-manager', name: 'channel manager' },
    ])
  })
  it('de-duplicates by slug, keeping the first spelling', () => {
    expect(normalizeTags(['Rate Parity', 'rate-parity', 'RATE PARITY']).map(t => t.name)).toEqual(['Rate Parity'])
  })
  it('ignores non-strings and empty values', () => {
    expect(normalizeTags(['', '  ', 42, null, '###', 'GDS'])).toEqual([{ slug: 'gds', name: 'GDS' }])
    expect(normalizeTags(undefined)).toEqual([])
  })
  it('caps the count and the length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag ${i}`)
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS)
    expect(normalizeTags(['x'.repeat(100)])[0].name).toHaveLength(40)
  })
})

describe('setArticleTags', () => {
  function fakeDb(tables = true) {
    const calls: { text: string; params?: unknown[] }[] = []
    let id = 100
    const db: Db = {
      async query(text, params) {
        calls.push({ text, params })
        if (text.includes('to_regclass')) return { rows: [{ ok: tables }], rowCount: 1 }
        if (text.includes('INSERT INTO nuvho_kb.topics')) {
          return { rows: [{ id: ++id, slug: params![0], name: params![1] }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      },
    }
    return { db, calls }
  }

  it('upserts each tag, removes dropped ones and links the rest', async () => {
    const { db, calls } = fakeDb()
    const written = await setArticleTags(db, 7, ['Booking Engine', 'Payments'])
    expect(written).toEqual([
      { slug: 'booking-engine', name: 'Booking Engine' },
      { slug: 'payments', name: 'Payments' },
    ])
    const del = calls.find(c => c.text.startsWith('DELETE'))!
    expect(del.params).toEqual([7, [101, 102]])
    const link = calls.find(c => c.text.includes('INSERT INTO nuvho_kb.article_topics'))!
    expect(link.params).toEqual([7, [101, 102]])
  })

  it('clears all tags for an empty list', async () => {
    const { db, calls } = fakeDb()
    await setArticleTags(db, 7, [])
    expect(calls.some(c => c.text.includes('INSERT INTO nuvho_kb.article_topics'))).toBe(false)
    expect(calls.find(c => c.text.startsWith('DELETE'))!.params).toEqual([7, []])
  })
})

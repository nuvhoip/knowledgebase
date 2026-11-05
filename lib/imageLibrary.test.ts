import { describe, expect, it } from 'vitest'
import { buildCollections, matchesQuery } from './imageLibrary'
import { collectionOf, creditOf, isImageFile, titleOf, toSourcePath } from '../scripts/lib/library-names.mjs'

describe('library-names (import script)', () => {
  it('normalises Windows and POSIX relative paths', () => {
    expect(toSourcePath('Regions\\UK\\UK London\\a.jpg')).toBe('Regions/UK/UK London/a.jpg')
    expect(toSourcePath('/Generic Imagery//Hotel/b.jpg')).toBe('Generic Imagery/Hotel/b.jpg')
  })

  it('derives the collection from the folder path', () => {
    expect(collectionOf('Regions/UK/UK London/a.jpg')).toBe('Regions/UK/UK London')
    expect(collectionOf('Regions\\Germany\\b.jpeg')).toBe('Regions/Germany')
    expect(collectionOf('loose.jpg')).toBe('Unsorted')
  })

  it('accepts photo files only', () => {
    expect(isImageFile('a.JPG')).toBe(true)
    expect(isImageFile('a.jpeg')).toBe(true)
    expect(isImageFile('a.png')).toBe(true)
    expect(isImageFile('a.webp')).toBe(true)
    expect(isImageFile('a.heic')).toBe(false)
    expect(isImageFile('Thumbs.db')).toBe(false)
    expect(isImageFile('.DS_Store')).toBe(false)
    expect(isImageFile('~$lock.jpg')).toBe(false)
  })

  it('uses the file name without extension as the title', () => {
    expect(titleOf('Regions/Ireland/I154_34447127.jpeg')).toBe('I154_34447127')
  })

  it('reads photographer credits from Unsplash and Pexels file names', () => {
    expect(creditOf('jorg-angeli-1tyuLfDOnG0-unsplash')).toBe('Jorg Angeli / Unsplash')
    expect(creditOf('vitaly-gariev-VmyqDMyRVq0-unsplash')).toBe('Vitaly Gariev / Unsplash')
    // Unsplash ids can contain a hyphen
    expect(creditOf('tamas-tuzes-katai-rEn-AdBr3Ig-unsplash')).toBe('Tamas Tuzes Katai / Unsplash')
    expect(creditOf('pexels-maria-kray-737731035-18587954')).toBe('Maria Kray / Pexels')
    expect(creditOf('pexels-principe-30052105')).toBe('Principe / Pexels')
    expect(creditOf('pexels-max-w-1673439416-34760007')).toBe('Max W / Pexels')
    expect(creditOf('I154_34447127')).toBeNull()
    expect(creditOf('Cairns Aquarium Hero Image')).toBeNull()
  })
})

describe('buildCollections', () => {
  it('groups by top-level folder with counts, sorted by path', () => {
    const cols = buildCollections([
      { collection: 'Regions/UK/UK London' },
      { collection: 'Generic Imagery/Hotel' },
      { collection: 'Regions/UK/UK London' },
      { collection: 'Regions/Germany' },
      { collection: 'Unsorted' },
    ])
    expect(cols).toEqual([
      { path: 'Generic Imagery/Hotel', group: 'Generic Imagery', label: 'Hotel', count: 1 },
      { path: 'Regions/Germany', group: 'Regions', label: 'Germany', count: 1 },
      { path: 'Regions/UK/UK London', group: 'Regions', label: 'UK › UK London', count: 2 },
      { path: 'Unsorted', group: 'Unsorted', label: 'Unsorted', count: 1 },
    ])
  })
})

describe('matchesQuery', () => {
  const img = { title: 'pexels-maria-kray-737731035', credit: 'Maria Kray / Pexels', collection: 'Regions/UK/UK London' }
  it('matches every word across title, credit and folder, case-insensitively', () => {
    expect(matchesQuery(img, '')).toBe(true)
    expect(matchesQuery(img, 'london')).toBe(true)
    expect(matchesQuery(img, 'Kray london')).toBe(true)
    expect(matchesQuery(img, 'kray sydney')).toBe(false)
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTICLE_ICONS, COMPONENT_CLASSES, SNIPPETS, componentClasses } from './articleComponents'
import { sanitizeArticleHtml } from './sanitize'

const root = join(__dirname, '..')

describe('article component vocabulary', () => {
  it('lists exactly the icons in public/icons', () => {
    const files = readdirSync(join(root, 'public/icons')).filter(f => f.endsWith('.svg')).map(f => f.replace(/\.svg$/, ''))
    expect([...ARTICLE_ICONS].sort()).toEqual(files.sort())
  })

  it('styles every class in app/globals.css', () => {
    const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
    const missing = COMPONENT_CLASSES.filter(c => !new RegExp(`\\.${c.replace(/[-_]/g, m => `\\${m}`)}(?![\\w-])`).test(css))
    expect(missing).toEqual([])
  })

  it('keeps every snippet intact through the save-path sanitiser', () => {
    for (const [key, s] of Object.entries(SNIPPETS)) {
      const clean = sanitizeArticleHtml(s.html) ?? ''
      const before = Array.from(s.html.matchAll(/class="([^"]+)"/g), m => m[1])
      const after = Array.from(clean.matchAll(/class="([^"]+)"/g), m => m[1])
      expect(after, key).toEqual(before)
      for (const cls of before.flatMap(c => c.split(' '))) expect(COMPONENT_CLASSES, `${key}: ${cls}`).toContain(cls)
    }
  })

  it('keeps brand icon images through the sanitiser', () => {
    expect(sanitizeArticleHtml('<p><img class="nw-icon" src="/icons/hotel.svg" alt=""></p>')).toBe('<p><img class="nw-icon" src="/icons/hotel.svg" alt="" /></p>')
  })

  it('filters a class attribute down to the vocabulary', () => {
    expect(componentClasses('fancy nw-card nw-card x')).toEqual(['nw-card'])
    expect(componentClasses(undefined)).toEqual([])
  })
})

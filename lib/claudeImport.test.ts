import { describe, it, expect } from 'vitest'
import { rebuildContent, joinChunks, textToHtml } from './claudeImport'

describe('rebuildContent', () => {
  const sections = ['# Report\n\nIntro line.', '## Summary\n\n- one\n- two', '### Detail\n\nText.']

  it('keeps line breaks and headings for heading-chunked documents', () => {
    const md = rebuildContent(sections, 'heading')
    expect(md).toBe('# Report\n\nIntro line.\n\n## Summary\n\n- one\n- two\n\n### Detail\n\nText.')
    const html = textToHtml(md)
    expect(html).toContain('<h3>Detail</h3>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
  })

  it('treats none / paragraph the same way', () => {
    expect(rebuildContent(['a', 'b'], 'none')).toBe('a\n\nb')
    expect(rebuildContent(['a', 'b'], 'paragraph')).toBe('a\n\nb')
  })

  it('still removes the word overlap of fixed-size chunks (and when the strategy is unknown)', () => {
    const fixed = ['one two three four', 'three four five six']
    expect(rebuildContent(fixed, 'fixed')).toBe(joinChunks(fixed))
    expect(rebuildContent(fixed, undefined)).toBe('one two three four five six')
  })
})

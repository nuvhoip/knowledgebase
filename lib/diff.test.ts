import { describe, expect, it } from 'vitest'
import { MAX_DIFF_CELLS, diffLines, htmlToLines } from './diff'

describe('htmlToLines', () => {
  it('gives one line per block with inline markup and entities flattened', () => {
    const html = '<h2>Rates &amp; fees</h2><p>Pay <strong>monthly</strong>.<br>Or yearly.</p><ul><li>One</li><li>Two</li></ul>'
    expect(htmlToLines(html)).toEqual(['Rates & fees', 'Pay monthly.', 'Or yearly.', 'One', 'Two'])
  })
  it('keeps table cells apart and shows image alt text', () => {
    expect(htmlToLines('<table><tr><th>Plan</th><th>Price</th></tr></table>')).toEqual(['Plan | Price'])
    expect(htmlToLines('<p><img src="/uploads/1.png" alt="Rate grid"></p>')).toEqual(['[image: Rate grid]'])
  })
  it('handles empty input', () => {
    expect(htmlToLines(null)).toEqual([])
    expect(htmlToLines('<p>&nbsp;</p>')).toEqual([])
  })
})

describe('diffLines', () => {
  const kinds = (ops: ReturnType<typeof diffLines>) => ops!.map(o => `${o.type === 'same' ? ' ' : o.type === 'add' ? '+' : '-'}${o.text}`)

  it('marks an edited line as removed then added, keeping context', () => {
    expect(kinds(diffLines(['A', 'B', 'C'], ['A', 'B2', 'C']))).toEqual([' A', '-B', '+B2', ' C'])
  })
  it('handles pure additions and deletions', () => {
    expect(kinds(diffLines(['A', 'C'], ['A', 'B', 'C']))).toEqual([' A', '+B', ' C'])
    expect(kinds(diffLines(['A', 'B', 'C'], ['A', 'C']))).toEqual([' A', '-B', ' C'])
    expect(kinds(diffLines([], ['A']))).toEqual(['+A'])
  })
  it('finds moved and repeated lines sensibly', () => {
    expect(kinds(diffLines(['X', 'A', 'B'], ['A', 'B', 'X']))).toEqual(['-X', ' A', ' B', '+X'])
  })
  it('reports identical input as all unchanged', () => {
    expect(diffLines(['A', 'B'], ['A', 'B'])!.every(o => o.type === 'same')).toBe(true)
  })
  it('gives up (null) on inputs too large to compare', () => {
    const n = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 1
    const a = Array.from({ length: n }, (_, i) => `a${i}`)
    const b = Array.from({ length: n }, (_, i) => `b${i}`)
    expect(diffLines(a, b)).toBeNull()
  })
})

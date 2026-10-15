import { describe, expect, it } from 'vitest'
import { buildToc, headingText, nestEntries, slugify, uniqueId } from './toc'

const outline = (html: string) =>
  buildToc(html).entries.map(function strip(e): unknown {
    return e.children.length ? [e.id, e.children.map(strip)] : e.id
  })

describe('slugify', () => {
  it('lower-cases and hyphenates', () => {
    expect(slugify('Getting Started with Nuvho')).toBe('getting-started-with-nuvho')
  })
  it('drops accents and punctuation, collapsing runs', () => {
    expect(slugify('Café — “Rates” & Availability!')).toBe('cafe-rates-availability')
  })
  it('falls back when nothing usable is left', () => {
    expect(slugify('***')).toBe('section')
    expect(slugify('日本語')).toBe('section')
  })
  it('caps the length without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(64)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueId', () => {
  it('adds -2, -3 … for repeats', () => {
    const used = new Set(['setup', 'setup-2'])
    expect(uniqueId('setup', used)).toBe('setup-3')
    expect(uniqueId('other', used)).toBe('other')
  })
})

describe('headingText', () => {
  it('strips inline markup and decodes entities', () => {
    expect(headingText('<strong>Step&nbsp;1:</strong> <em>Log&nbsp;in</em> &amp; go')).toBe('Step 1: Log in & go')
  })
  it('reads a line break as a space but adds none around inline tags', () => {
    expect(headingText('Line one<br>Line two')).toBe('Line one Line two')
    expect(headingText('<a href="/x">Step 1</a>: go')).toBe('Step 1: go')
  })
  it('decodes numeric entities', () => {
    expect(headingText('Rates &#8211; 2026 &#x2014; AU')).toBe('Rates – 2026 — AU')
  })
})

describe('nestEntries', () => {
  it('nests H3 under the preceding H2', () => {
    const tree = nestEntries([
      { id: 'a', text: 'A', level: 2 },
      { id: 'a1', text: 'A1', level: 3 },
      { id: 'a2', text: 'A2', level: 3 },
      { id: 'b', text: 'B', level: 2 },
    ])
    expect(tree.map(e => [e.id, e.children.map(c => c.id)])).toEqual([['a', ['a1', 'a2']], ['b', []]])
  })
  it('keeps an H3 that comes before any H2 at the top level', () => {
    const tree = nestEntries([
      { id: 'x', text: 'X', level: 3 },
      { id: 'a', text: 'A', level: 2 },
    ])
    expect(tree.map(e => e.id)).toEqual(['x', 'a'])
  })
  it('handles skipped levels (H1 → H3)', () => {
    const tree = nestEntries([
      { id: 'top', text: 'Top', level: 1 },
      { id: 'deep', text: 'Deep', level: 3 },
      { id: 'mid', text: 'Mid', level: 2 },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map(c => c.id)).toEqual(['deep', 'mid'])
  })
})

describe('buildToc', () => {
  it('outlines H2/H3, nested, and leaves other headings alone', () => {
    const html = '<h2>Overview</h2><p>x</p><h3>Scope</h3><h4>Detail</h4><h2>Steps</h2>'
    const toc = buildToc(html)
    expect(outline(html)).toEqual([['overview', ['scope']], 'steps'])
    expect(toc.count).toBe(3)
    expect(toc.html).toContain('<h4>Detail</h4>')
  })

  it('adds ids and tabindex to the rendered copy only', () => {
    const html = '<h2 class="intro" style="text-align: center">Overview</h2>'
    const toc = buildToc(html)
    expect(toc.html).toBe('<h2 id="overview" tabindex="-1" class="intro" style="text-align: center">Overview</h2>')
    expect(html).toBe('<h2 class="intro" style="text-align: center">Overview</h2>') // input untouched
  })

  it('de-duplicates repeated headings', () => {
    const toc = buildToc('<h2>Setup</h2><h3>Setup</h3><h2>Setup</h2>')
    expect(toc.entries.map(e => e.id)).toEqual(['setup', 'setup-3'])
    expect(toc.entries[0].children[0].id).toBe('setup-2')
  })

  it('keeps an author-set id and avoids ids used elsewhere in the article', () => {
    const html = '<p><a id="setup"></a>anchor</p><h2 id="custom">Intro</h2><h2>Setup</h2>'
    const toc = buildToc(html)
    expect(toc.entries.map(e => e.id)).toEqual(['custom', 'setup-2'])
    expect(toc.html).toContain('<h2 id="custom" tabindex="-1">Intro</h2>')
  })

  it('renames the second of two headings that share an id', () => {
    const toc = buildToc('<h2 id="dup">One</h2><h2 id="dup">Two</h2>')
    expect(toc.entries.map(e => e.id)).toEqual(['dup', 'two'])
    expect(toc.html).toContain('<h2 id="two" tabindex="-1">Two</h2>')
  })

  it('skips empty headings', () => {
    const toc = buildToc('<h2><br></h2><h2>&nbsp;</h2><h2> <strong></strong> </h2><h2>Real</h2>')
    expect(toc.entries.map(e => e.id)).toEqual(['real'])
    expect(toc.html.startsWith('<h2><br></h2>')).toBe(true)
  })

  it('handles inline markup, entities and links inside headings', () => {
    const toc = buildToc('<h2><a href="/x">Step&nbsp;1</a>: <strong>Log in</strong></h2>')
    expect(toc.entries[0]).toMatchObject({ id: 'step-1-log-in', text: 'Step 1: Log in' })
  })

  it('handles upper-case tags and multi-line content from pasted HTML', () => {
    const toc = buildToc('<H2 CLASS="x">\n  Rates\n  &amp; Fees\n</H2>')
    expect(toc.entries[0]).toMatchObject({ id: 'rates-fees', text: 'Rates & Fees' })
  })

  it('reports the count used to decide whether to show the panel', () => {
    expect(buildToc('<p>No headings</p>').count).toBe(0)
    expect(buildToc('<h2>Only one</h2>').count).toBe(1)
    expect(buildToc('').entries).toEqual([])
  })
})

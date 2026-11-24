import { describe, expect, it } from 'vitest'
import { importArticleHtml } from './htmlImport'
import { buildToc } from './toc'

// Condensed copy of the reference page (Nuvho_Hotel_Brand_Protection_v1.0.0.html): the same
// markup for every pattern it uses, inside the same DocNav chrome.
const REFERENCE = `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8">
<title>Brand Protection for Hotels — Trade Mark Infringement and How to Action It | Nuvho</title>
<style>@font-face{font-family:'Comfortaa';src:url(data:font/woff2;base64,AAAA)}</style>
</head><body>
<button class="nav-toggle" id="navToggle">☰</button>
<nav class="docnav" id="docnav"><div class="logo-block"><svg viewBox="0 0 10 10"><path d="M0 0"/></svg></div>
  <a class="nav-item" href="#s1"><span class="nav-num">01</span><span class="nav-name">Why</span></a>
  <div class="nav-foot">© Nuvho Systems Pty Ltd</div></nav>
<main>
  <header class="page-header"><div class="header-inner">
    <div class="header-mark">nuvho<span>Smart Hoteliers</span></div>
    <h1>Brand Protection for Hotels</h1>
    <p class="subtitle">Trade mark infringement, the grey zone around it, and the process to action it — across Australia, the United Kingdom and Ireland.</p>
  </div></header>
  <div class="page-body">
    <section id="s1">
      <div class="sec-head">
        <span class="sec-num">01</span>
        <span class="sec-ico"><svg viewBox="0 0 576 512"><path d="M48 64"/></svg></span>
        <h2>Why hotel brands are attacked differently</h2>
      </div>
      <p class="sec-desc">Most businesses worry about a competitor adopting a confusingly similar name.</p>
      <div class="grid-3">
        <div class="card">
          <div class="lbl">Feature one</div>
          <h4>Your brand is a navigational term</h4>
          <div class="card-body">Someone typing your hotel name has already decided.</div>
        </div>
        <div class="card">
          <div class="lbl">Feature two</div>
          <h4>Third-party use is often authorised</h4>
          <div class="card-body">You deliberately let OTAs use your name.</div>
        </div>
      </div>
      <div class="callout">
        <div class="lbl">Current example</div>
        <p>In July 2026 the San Francisco City Attorney filed suit &amp; more.</p>
      </div>
      <div class="callout risk"><div class="lbl">The common gap</div><p>Most hotels have registered the property name.</p></div>
      <div class="callout ok"><div class="lbl">Word mark first</div><p>Register the <strong>word mark</strong>, not the logo.</p></div>
    </section>
    <section id="s3">
      <h3>Three strategic points</h3>
      <div class="card"><div class="lbl">Post-Brexit</div><h4>An EU trade mark no longer covers the UK</h4><div class="card-body">Two filings now.</div></div>
      <div class="card"><div class="lbl">Multi-jurisdiction groups</div><h4>The Madrid Protocol is built for this</h4><div class="card-body">One application.</div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Class</th><th>UDRP<br><span style="font-weight:400">.com, .net</span></th></tr></thead>
        <tbody><tr><td>43</td><td><span class="badge legal">Essential</span> The core class.</td></tr>
        <tr><td>35</td><td><span class="badge grey">Consider</span> Loyalty programmes.</td></tr></tbody>
      </table></div>
    </section>
    <div class="divider"></div>
    <section id="s8">
      <div class="step"><span class="step-n">1</span><div><h4>Capture the evidence</h4><p>Screenshot with the URL.</p></div></div>
      <div class="step"><span class="step-n">2</span><div><h4>Check the contract first</h4><p>Read your OTA agreements.</p></div></div>
      <p>Register as <code>yourhotel.reseller.com</code>.</p>
      <img src="data:image/png;base64,iVBORw0KGgo=" alt="inline">
      <div class="cta">
        <h3>Start with the audit</h3>
        <p>Almost every hotel finds at least one asset registered to the wrong entity.</p>
        <a class="nv-btn nv-btn--solid" href="https://nuvho.com">Talk to Nuvho</a>
      </div>
      <p class="disclaimer">This article is general information. It is not legal advice.</p>
    </section>
  </div>
  <footer><div class="foot-inner"><span class="c">© Nuvho Systems Pty Ltd</span></div></footer>
</main>
<script>document.getElementById('navToggle')</script>
</body></html>`

describe('importArticleHtml — reference page', () => {
  const r = importArticleHtml(REFERENCE)

  it('takes the title from the h1 and the description from the subtitle', () => {
    expect(r.title).toBe('Brand Protection for Hotels')
    expect(r.description).toMatch(/^Trade mark infringement, the grey zone/)
  })

  it('leaves out the page chrome, scripts, styles, fonts and the copyright line', () => {
    for (const gone of ['nav-item', 'navToggle', '<script', '<style', 'font-face', '©', 'Smart Hoteliers', '<h1', '<svg', 'data:']) {
      expect(r.html).not.toContain(gone)
    }
  })

  it('turns section heads into plain headings without numbers', () => {
    expect(r.html).toContain('<h2>Why hotel brands are attacked differently</h2>')
    expect(r.html).not.toMatch(/>01</)
    expect(r.html).toContain('<p>Most businesses worry')
  })

  it('maps grids and cards, dropping the eyebrow labels above headings', () => {
    expect(r.html).toContain('<div class="nw-cards nw-cards--3"><div class="nw-card"><h4>Your brand is a navigational term</h4><p>Someone typing')
    expect(r.html).not.toContain('Feature one')
    // standalone consecutive cards become one single-column group
    expect(r.html).toMatch(/<div class="nw-cards"><div class="nw-card"><h4>An EU trade mark[\s\S]*?<\/div><div class="nw-card"><h4>The Madrid Protocol/)
  })

  it('maps the three callout kinds with brand icons and the label as title', () => {
    expect(r.html).toContain('<div class="nw-callout"><img class="nw-icon" src="/icons/lightbulb.svg" alt="" /><div><h4>Current example</h4><p>In July 2026 the San Francisco City Attorney filed suit &amp; more.</p></div></div>')
    expect(r.html).toContain('<div class="nw-callout nw-callout--risk"><img class="nw-icon" src="/icons/triangle-exclamation.svg" alt="" /><div><h4>The common gap</h4>')
    expect(r.html).toContain('<div class="nw-callout nw-callout--ok"><img class="nw-icon" src="/icons/circle-check.svg" alt="" /><div><h4>Word mark first</h4><p>Register the <strong>word mark</strong>, not the logo.</p>')
  })

  it('turns consecutive steps into one numbered list', () => {
    expect(r.html).toContain('<ol class="nw-steps"><li><h4>Capture the evidence</h4><p>Screenshot with the URL.</p></li><li><h4>Check the contract first</h4>')
  })

  it('wraps tables and maps badges', () => {
    expect(r.html).toContain('<div class="nw-table"><table>')
    expect(r.html).toContain('<span class="nw-badge nw-badge--ok">Essential</span> The core class.')
    expect(r.html).toContain('<span class="nw-badge">Consider</span>')
    expect(r.html).toContain('<th>UDRP<br />.com, .net</th>')
  })

  it('maps the divider, call to action and disclaimer', () => {
    expect(r.html).toContain('<hr />')
    expect(r.html).toContain('<div class="nw-cta"><p class="nw-cta__title">Start with the audit</p>')
    expect(r.html).toContain('<p><a class="nw-cta__link" href="https://nuvho.com">Talk to Nuvho</a></p>')
    expect(r.html).toContain('<p class="nw-fineprint">This article is general information. It is not legal advice.</p>')
  })

  it('keeps inline code', () => {
    expect(r.html).toContain('<code>yourhotel.reseller.com</code>')
  })

  it('reports what it removed', () => {
    expect(r.notes.join(' ')).toMatch(/1 inline SVG icon was removed/)
    expect(r.notes.join(' ')).toMatch(/1 embedded image was removed/)
    expect(r.notes.join(' ')).toMatch(/section and step numbers were removed/)
    expect(r.notes.join(' ')).toMatch(/4 labels above card headings were removed/)
  })

  it('produces an outline the table of contents can use', () => {
    const toc = buildToc(r.html)
    expect(toc.entries.map(e => e.text)).toEqual(['Why hotel brands are attacked differently'])
    expect(toc.count).toBe(2) // + the H3
  })
})

describe('importArticleHtml — other input', () => {
  it('falls back to <title> and <main> for plain pages', () => {
    const r = importArticleHtml('<html><head><title>Rate plans | Nuvho</title><meta name="description" content="How rate plans work."></head><body><header>Site</header><main><h2>Basics</h2><p>Text <a href="/x" onclick="evil()">link</a></p></main></body></html>')
    expect(r.title).toBe('Rate plans')
    expect(r.description).toBe('How rate plans work.')
    expect(r.html).toBe('<h2>Basics</h2><p>Text <a href="/x">link</a></p>')
  })

  it('keeps KB component markup when re-importing', () => {
    const kb = '<div class="nw-callout nw-callout--info"><img class="nw-icon" src="/icons/circle-info.svg" alt=""><div><h4>Note</h4><p>Body</p></div></div>'
    expect(importArticleHtml(`<body>${kb}</body>`).html).toBe(kb.replace('alt="">', 'alt="" />'))
  })

  it('strips unknown classes, styles and event handlers', () => {
    const r = importArticleHtml('<body><p class="fancy" style="color:red" onmouseover="x()">Hi</p><span class="tag">a</span></body>')
    expect(r.html).toBe('<p>Hi</p>a')
  })

  it('turns a plain div of text into a paragraph, but not inside tables', () => {
    expect(importArticleHtml('<body><div style="x">Loose <b>text</b></div><div><p>Already</p></div></body>').html)
      .toBe('<p>Loose <b>text</b></p><p>Already</p>')
    expect(importArticleHtml('<body><table><tr><td><div>Cell</div></td></tr></table></body>').html)
      .toBe('<div class="nw-table"><table><tr><td>Cell</td></tr></table></div>')
  })

  it('drops only the title <h1>; later ones become sections', () => {
    const r = importArticleHtml('<body><h1>Guide</h1><p>Intro</p><h1>Part two</h1><p>More</p></body>')
    expect(r.title).toBe('Guide')
    expect(r.html).toBe('<p>Intro</p><h2>Part two</h2><p>More</p>')
  })

  it('preserves whitespace in preformatted text', () => {
    expect(importArticleHtml('<body><pre><code>a\n  b</code></pre></body>').html).toBe('<pre><code>a\n  b</code></pre>')
  })

  it('says so when there is nothing to import', () => {
    const r = importArticleHtml('<html><body><nav>menu</nav></body></html>')
    expect(r.html).toBe('')
    expect(r.notes).toContain('No article content was found in that HTML.')
  })
})

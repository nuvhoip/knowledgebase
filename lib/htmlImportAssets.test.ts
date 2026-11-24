import { describe, expect, it } from 'vitest'
import { convertArticleHtml, resolveAssetPlaceholders } from './htmlImport'
import { sanitizeArticleHtml } from './sanitize'

// Asset handling in the importer (decision 24 Nov 2026, NUVCL-201). The reference is Jude's
// Claude Code export "hotel-mcp-ecosystem-opinion.html": a Nuvho article page whose diagram
// is an inline SVG styled by the page, with a lead paragraph, a callout and tag chips.

const OPINION = `<!DOCTYPE html><html lang="en-AU"><head>
<title>Hotel MCP Ecosystem</title>
<meta name="description" content="Hotel AI agents are held back by weak MCP know-how.">
<style>
:root{ --iron:#414B4C; --body:'Raleway',system-ui,sans-serif; }
body{margin:0;color:var(--iron);font:400 15px/1.6 var(--body)}
.figure svg{width:100%;height:auto;display:block}
@media (max-width:900px){ .figure svg{display:none} }
</style></head><body>
<header class="hdr"><img src="https://sftp.nuvho.com/logo.png" alt="Nuvho"></header>
<section class="hero"><h1>The hotel MCP ecosystem isn't ready yet</h1><p class="hero__copy">Hero copy.</p></section>
<div class="meta"><div class="tags"><span class="tag">AI Agents</span><span class="tag">MCP</span></div></div>
<article class="article">
  <p class="lead">Agentic AI is ready for the back office.</p>
  <h2>Few people understand the infrastructure</h2>
  <div class="callout"><p>The hotel owns its data.</p></div>
  <figure class="figure">
    <svg viewBox="0 0 1000 470" role="img" font-family="Raleway, system-ui, sans-serif"><title>From one AI per vendor to one AI layer</title>
      <text x="0" y="28" font-family="Comfortaa" font-weight="600" fill="#28687F">Today</text><rect x="0" y="60" width="220" height="52"/></svg>
    <figcaption>Each supplier sells its own AI.</figcaption>
  </figure>
  <p>Text <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="dot"> more.</p>
</article>
<section class="band"><h2>Find out how connected your stack is</h2></section>
<footer class="ftr">© Nuvho</footer></body></html>`

describe('convertArticleHtml — assets', () => {
  const r = convertArticleHtml(OPINION)

  it('takes title, description and the tag chips', () => {
    expect(r.title).toBe("The hotel MCP ecosystem isn't ready yet")
    expect(r.description).toBe('Hotel AI agents are held back by weak MCP know-how.')
    expect(r.tags).toEqual(['AI Agents', 'MCP'])
  })

  it('keeps the lead paragraph as a lead', () => {
    expect(r.html).toContain('<p class="nw-lead">Agentic AI is ready for the back office.</p>')
  })

  it('turns the inline SVG into a figure placeholder where it was, with its title as alt text', () => {
    expect(r.html).toContain('<figure class="nw-figure"><img data-nv-asset="a1" alt="From one AI per vendor to one AI layer"><figcaption>Each supplier sells its own AI.</figcaption></figure>')
    const a = r.assets[0]
    expect(a).toMatchObject({ id: 'a1', kind: 'svg', role: 'figure', ref: 'Inline SVG — From one AI per vendor to one AI layer' })
    expect(a.source.type).toBe('svg')
  })

  it('keeps the drawing’s attribute case and folds in the page rules aimed at it (not @media ones)', () => {
    const svg = (r.assets[0].source as { svg: string }).svg
    expect(svg).toContain('viewBox="0 0 1000 470"')
    expect(svg).toContain('<style>svg{width:100%;height:auto;display:block}</style>')
    expect(svg).not.toContain('display:none')
  })

  it('records what the drawing inherited from the page', () => {
    expect(r.svgDefaults).toEqual({ fontFamily: "'Raleway',system-ui,sans-serif", color: '#414B4C' })
  })

  it('collects a data: image as an inline asset, and leaves the chrome logo out', () => {
    expect(r.assets[1]).toMatchObject({ kind: 'image', role: 'inline', alt: 'dot', ref: 'Embedded image — dot' })
    expect(r.assets).toHaveLength(2)
    expect(r.html).not.toContain('logo.png')
    expect(r.html).not.toContain('Find out how connected')
  })

  it('swaps placeholders for stored URLs, with the drawing’s size', () => {
    const html = resolveAssetPlaceholders(r.html, {
      a1: { src: '/uploads/mabc12-0123456789ab.svg', width: 1000, height: 470 },
      a2: { src: '/uploads/mabc12-0123456789ac.png' },
    })
    expect(html).toContain('<figure class="nw-figure"><img src="/uploads/mabc12-0123456789ab.svg" alt="From one AI per vendor to one AI layer" width="1000" height="470" /><figcaption>')
    expect(html).toContain('<p>Text <img src="/uploads/mabc12-0123456789ac.png" alt="dot" /> more.</p>')
    expect(html).not.toContain('data-nv-asset')
  })

  it('keeps a figure that holds a link or text, not just a caption', () => {
    const c = convertArticleHtml('<body><figure><video src="https://cdn.example.com/demo.mp4"></video><figcaption>Demo</figcaption></figure></body>')
    const html = resolveAssetPlaceholders(c.html, {})
    expect(html).toContain('<a href="https://cdn.example.com/demo.mp4">Watch the video</a>')
    expect(html).toContain('<figcaption>Demo</figcaption>')
  })

  it('reads the body font after an @import (Google Fonts) at the top of the styles', () => {
    const c = convertArticleHtml('<html><head><style>@import url(https://fonts.googleapis.com/css2?family=Comfortaa); body{font-family:Comfortaa,sans-serif;color:#123456}</style></head><body><p>x</p></body></html>')
    expect(c.svgDefaults).toEqual({ fontFamily: 'Comfortaa,sans-serif', color: '#123456' })
  })

  it('drops an asset that could not be stored, keeping its caption as fine print', () => {
    const html = resolveAssetPlaceholders(r.html, { a1: null, a2: null })
    expect(html).not.toContain('<figure')
    expect(html).toContain('<p class="nw-fineprint">Each supplier sells its own AI.</p>')
    expect(html).toContain('<p>Text  more.</p>')
  })
})

describe('convertArticleHtml — icons, links, bundles', () => {
  it('puts a DocNav section icon inside its heading as an icon asset', () => {
    const r = convertArticleHtml('<body><div class="sec-head"><span class="sec-num">01</span><span class="sec-ico"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg></span><h2>Why</h2></div></body>')
    expect(r.html).toBe('<h2><img data-nv-asset="a1" alt="" class="nw-icon">Why</h2>')
    expect(r.assets[0]).toMatchObject({ kind: 'svg', role: 'icon' })
  })

  it('stores a repeated icon once', () => {
    const ico = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1"/></svg>'
    const r = convertArticleHtml(`<body><p>${ico} One</p><p>${ico} Two</p></body>`)
    expect(r.assets).toHaveLength(1)
    expect(r.html.match(/data-nv-asset="a1"/g)).toHaveLength(2)
  })

  it('classifies linked and relative images', () => {
    const r = convertArticleHtml('<body><figure><img src="https://example.com/a.jpg" alt="A"></figure><p><img src="img/chart.png" alt="Chart"></p><p><img src="//cdn.example.com/b.png" alt=""></p></body>')
    expect(r.assets.map(a => a.source)).toEqual([
      { type: 'url', url: 'https://example.com/a.jpg' },
      { type: 'path', path: 'img/chart.png' },
      { type: 'url', url: 'https://cdn.example.com/b.png' },
    ])
    expect(r.assets[0].role).toBe('figure')
  })

  it('keeps KB uploads and brand icons as they are', () => {
    const r = convertArticleHtml('<body><p><img src="/uploads/mabc12-0123456789ab.png" alt="x"> <img class="nw-icon" src="/icons/lightbulb.svg" alt=""></p></body>')
    expect(r.assets).toHaveLength(0)
    expect(r.html).toContain('<img src="/uploads/mabc12-0123456789ab.png" alt="x">')
    expect(r.html).toContain('<img class="nw-icon" src="/icons/lightbulb.svg" alt="">')
  })

  it('uses the <img> inside a <picture>', () => {
    const r = convertArticleHtml('<body><picture><source srcset="a.webp"><img src="a.jpg" alt="Pic"></picture></body>')
    expect(r.assets[0].source).toEqual({ type: 'path', path: 'a.jpg' })
  })
})

describe('convertArticleHtml — video and embeds', () => {
  it('plays an MP4 on sftp.nuvho.com from the link', () => {
    const r = convertArticleHtml('<body><video src="https://sftp.nuvho.com/publicdownloads/explainer.mp4" controls></video></body>')
    expect(r.assets).toHaveLength(0)
    expect(r.html).toContain('<video class="nw-video" src="https://sftp.nuvho.com/publicdownloads/explainer.mp4" controls="controls"')
  })

  it('stores a video file from the bundle, via <source>', () => {
    const r = convertArticleHtml('<body><video controls><source src="video/demo.mp4" type="video/mp4"></video></body>')
    expect(r.assets[0]).toMatchObject({ kind: 'video', role: 'video', source: { type: 'path', path: 'video/demo.mp4' } })
    expect(r.html).toContain('<figure class="nw-figure"><video data-nv-asset="a1" class="nw-video"')
  })

  it('links (does not play) SharePoint and other sites’ videos, and says why', () => {
    const r = convertArticleHtml('<body><video src="https://nuvho.sharepoint.com/sites/x/v.mp4"></video><video src="https://example.com/v.mp4"></video></body>')
    expect(r.html).toBe('<p><a href="https://nuvho.sharepoint.com/sites/x/v.mp4">Watch the video</a></p><p><a href="https://example.com/v.mp4">Watch the video</a></p>')
    expect(r.notes.join(' ')).toMatch(/SharePoint video is linked, not played/)
    expect(r.notes.join(' ')).toMatch(/video on another website is linked/)
  })

  it('keeps YouTube, Vimeo and Scribe iframes as canonical embeds; drops other frames', () => {
    const r = convertArticleHtml('<body><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?start=30"></iframe><iframe src="https://vimeo.com/123456789"></iframe><iframe src="https://scribehow.com/shared/How_to_close_a_month__abc123"></iframe><iframe src="https://evil.example/x"></iframe></body>')
    const html = sanitizeArticleHtml(r.html)!
    expect(html).toContain('<div class="nw-embed nw-embed--youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30" title="YouTube video"')
    expect(html).toContain('src="https://player.vimeo.com/video/123456789"')
    expect(html).toContain('src="https://scribehow.com/embed/How_to_close_a_month__abc123"')
    expect(html).not.toContain('evil.example')
    expect(r.notes.join(' ')).toMatch(/1 embedded frame was removed/)
  })

  it('says a canvas chart cannot come across', () => {
    const r = convertArticleHtml('<body><p>Intro</p><canvas id="c"></canvas></body>')
    expect(r.notes.join(' ')).toMatch(/1 chart drawn with JavaScript \(canvas\) could not be imported/)
  })
})

describe('sanitizeArticleHtml — media', () => {
  it('keeps uploaded and sftp.nuvho.com MP4s, drops other video sources', () => {
    expect(sanitizeArticleHtml('<video src="/uploads/mabc12-0123456789ab.mp4"></video>')).toBe('<video src="/uploads/mabc12-0123456789ab.mp4" controls="controls"></video>')
    expect(sanitizeArticleHtml('<video src="https://sftp.nuvho.com/publicdownloads/a.mp4" onplay="x()"></video>')).toBe('<video src="https://sftp.nuvho.com/publicdownloads/a.mp4" controls="controls"></video>')
    expect(sanitizeArticleHtml('<p>a</p><video src="https://example.com/a.mp4"></video>')).toBe('<p>a</p>')
  })

  it('normalises allowed iframes and removes the rest (and their sandbox / srcdoc tricks)', () => {
    expect(sanitizeArticleHtml('<iframe src="https://youtu.be/dQw4w9WgXcQ" sandbox="" srcdoc="<script>"></iframe>'))
      .toBe('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>')
    expect(sanitizeArticleHtml('<p>a</p><iframe src="https://player.vimeo.com.evil.example/video/1"></iframe>')).toBe('<p>a</p>')
    expect(sanitizeArticleHtml('<p>a</p><iframe src="javascript:alert(1)"></iframe>')).toBe('<p>a</p>')
  })

  it('is stable: sanitising importer output again changes nothing (TinyMCE round trips)', () => {
    const once = resolveAssetPlaceholders(convertArticleHtml(OPINION).html, { a1: { src: '/uploads/mabc12-0123456789ab.svg', width: 1000, height: 470 }, a2: null })
    expect(sanitizeArticleHtml(once)).toBe(once)
  })
})

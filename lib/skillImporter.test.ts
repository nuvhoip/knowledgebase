import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { importArticleHtml } from './htmlImport'

// The nuvho-knowledge-save skill (HTML mode) runs a bundled copy of the importer
// (scripts/build-skill-importer.mjs). It must produce exactly what the editor's Import does.

const PAGE = `<!DOCTYPE html><html><head><title>Rate Parity | Nuvho</title>
<meta name="description" content="Keep OTA rates in line with your direct rate.">
<style>@font-face{src:url(data:font/woff2;base64,QUJD)}</style></head><body>
<nav>Menu</nav><main><h1>Rate Parity</h1>
<section><div class="sec-head"><span class="sec-num">01</span><h2>Why it matters</h2></div>
<div class="grid-3"><div class="card"><div class="lbl">One</div><h4>Direct</h4><div class="card-body">Best rate.</div></div></div>
<div class="callout risk"><div class="lbl">Watch out</div><p>Rate leaks &amp; wholesalers.</p></div>
<div class="step"><span class="step-n">1</span><div><h4>Audit</h4><p>Check daily.</p></div></div>
<div class="tbl-wrap"><table><tr><th>Channel</th></tr><tr><td><span class="badge ok">Live</span> Booking.com</td></tr></table></div>
<div class="cta"><h3>Talk to us</h3><a href="https://nuvho.com">Contact</a></div>
<p class="disclaimer">General information only.</p></section></main>
<footer>© Nuvho</footer><script>alert(1)</script></body></html>`

describe('skill importer bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-import-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('builds, reports its version and matches lib/htmlImport exactly', () => {
    const bundle = join(dir, 'kb-import.cjs')
    execFileSync(process.execPath, ['scripts/build-skill-importer.mjs', bundle], { stdio: 'pipe' })

    const version = execFileSync(process.execPath, [bundle, '--version']).toString().trim()
    expect(version).toMatch(/^kb-import \d{4}-\d{2}-\d{2} \S+ src:[0-9a-f]{12}$/)

    const page = join(dir, 'page.html')
    writeFileSync(page, PAGE)
    execFileSync(process.execPath, [bundle, page, join(dir, 'out')])

    const expected = importArticleHtml(PAGE)
    const report = JSON.parse(readFileSync(join(dir, 'out', 'import.json'), 'utf8'))
    const article = readFileSync(join(dir, 'out', 'article.html'), 'utf8')

    expect(article).toBe(expected.html + '\n')
    expect(report).toMatchObject({ importer: version, title: expected.title, description: expected.description, notes: expected.notes })
    expect(article).toContain('<div class="nw-callout nw-callout--risk">')
    expect(article).not.toContain('Menu')
  }, 60_000)
})

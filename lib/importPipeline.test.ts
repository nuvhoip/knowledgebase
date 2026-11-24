import { describe, expect, it, vi, beforeEach } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { runImport, ImportError } from './importPipeline'

// The import pipeline end to end with storage and the database mocked: what gets stored,
// what the article HTML looks like, what is recorded and what the author is told.
// (vi.mock is hoisted above the imports, so its state comes from vi.hoisted.)

const { saved, recorded, reusedSha } = vi.hoisted(() => ({
  reusedSha: 'none',
  saved: [] as { mime: string; bytes: number; by?: string }[],
  recorded: [] as unknown[],
}))
vi.mock('@/lib/uploads', async orig => {
  const real = await orig<typeof import('./uploads')>()
  return {
    ...real,
    saveUpload: vi.fn(async (buf: Buffer, mime: string, by?: string) => {
      saved.push({ mime, bytes: buf.length, by })
      const id = `mtest${saved.length}-0123456789ab`
      const ext = real.ALLOWED_TYPES[mime]
      return { url: `/uploads/${id}.${ext}`, filename: `${id}.${ext}`, backend: 'local', id }
    }),
  }
})
vi.mock('@/lib/importDb', () => ({
  // A re-export reuses a stored copy of identical bytes; here the 1×1 PNG was "stored before"
  findImportedUpload: vi.fn(async (sha: string) => sha === reusedSha ? { uploadId: 'mold00-0123456789ab', url: '/uploads/mold00-0123456789ab.png' } : null),
  recordImport: vi.fn(async (input: unknown) => { recorded.push(input); return '00000000-0000-4000-8000-000000000001' }),
}))

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const PAGE = `<!doctype html><html><head><title>Guide</title>
<style>body{font-family:'Raleway',sans-serif;color:#414B4C}</style></head><body><main>
<h1>Month-end close</h1>
<p class="lead">Close the month in five steps.</p>
<figure><svg viewBox="0 0 400 200"><title>Close timeline</title><text x="10" y="20" font-family="Comfortaa" font-weight="600">Day 1</text><rect x="10" y="40" width="100" height="20"/></svg><figcaption>The timeline.</figcaption></figure>
<p><img src="img/screen.png" alt="Screen"></p>
<p><img src="data:image/png;base64,${PNG_1x1.toString('base64')}" alt="Dot"></p>
<p><img src="img/missing.png" alt="Gone"></p>
</main></body></html>`

beforeEach(() => { saved.length = 0; recorded.length = 0 })

describe('runImport', () => {
  it('imports a .zip: stores the drawing (with fonts), the bundled and the embedded image, and reports the missing one', async () => {
    const zip = Buffer.from(zipSync({
      'export/guide.html': strToU8(PAGE),
      'export/img/screen.png': new Uint8Array(PNG_1x1),
      'export/.claude/launch.json': strToU8('{}'),
    }))
    const r = await runImport({ data: zip, fileName: 'export.zip', by: 'jose.delgado@nuvho.com', via: 'claude' })

    expect(r.title).toBe('Month-end close')
    expect(r.importId).toBe('00000000-0000-4000-8000-000000000001')
    expect(saved.map(s => s.mime).sort()).toEqual(['image/png', 'image/png', 'image/svg+xml'])
    expect(saved.every(s => s.by === 'jose.delgado@nuvho.com')).toBe(true)

    // In place, with sizes
    expect(r.html).toMatch(/<figure class="nw-figure"><img src="\/uploads\/mtest\d-0123456789ab\.svg" alt="Close timeline" width="400" height="200" \/><figcaption>The timeline\.<\/figcaption><\/figure>/)
    expect(r.html).toMatch(/<img src="\/uploads\/mtest\d-0123456789ab\.png" alt="Screen" width="1" height="1" \/>/)
    expect(r.html).not.toContain('missing.png')
    expect(r.html).not.toContain('data-nv-asset')

    expect(r.notes[0]).toBe('Kept 1 drawing, 2 images in place, stored on the Knowledge Base. They are listed under Assets.')
    expect(r.notes.join(' ')).toMatch(/Could not keep img\/missing\.png: img\/missing\.png is not in the \.zip\./)
    expect(r.assets.map(a => [a.kind, !!a.url])).toEqual([['svg', true], ['image', true], ['image', true], ['image', false]])

    const rec = recorded[0] as { sourceKind: string; sourceName: string; via: string; assets: { error: string | null }[] }
    expect(rec).toMatchObject({ sourceKind: 'zip', sourceName: 'export.zip → guide.html', via: 'claude' })
    expect(rec.assets[3].error).toMatch(/not in the \.zip/)
  })

  it('reuses an identical file stored by an earlier import instead of storing it again', async () => {
    const { createHash } = await import('crypto')
    const sha = createHash('sha256').update(PNG_1x1).digest('hex')
    const mod = await import('@/lib/importDb')
    vi.mocked(mod.findImportedUpload).mockImplementation(async s => s === sha ? { uploadId: 'mold00-0123456789ab', url: '/uploads/mold00-0123456789ab.png' } : null)
    const r = await runImport({ data: Buffer.from(PAGE), fileName: 'guide.html', by: 'a@nuvho.com', via: 'editor' })
    expect(r.html).toContain('<img src="/uploads/mold00-0123456789ab.png" alt="Dot"')
    expect(saved.filter(s => s.mime === 'image/png')).toHaveLength(0) // the PNG was not stored again
  })

  it('refuses a page in a .zip larger than 8 MB', async () => {
    const big = '<html><body><main><h1>Big</h1><p>' + 'x'.repeat(8 * 1024 * 1024) + '</p></main></body></html>'
    const zip = Buffer.from(zipSync({ 'big.html': strToU8(big) }))
    await expect(runImport({ data: zip, fileName: 'big.zip', by: 'a@nuvho.com', via: 'claude' })).rejects.toThrow(/larger than 8 MB/)
  })

  it('tells the author to send a .zip when a single page points at files next to it', async () => {
    const r = await runImport({ data: Buffer.from(PAGE), fileName: 'guide.html', by: 'a@nuvho.com', via: 'editor' })
    expect(r.notes.join(' ')).toMatch(/img\/screen\.png is a file next to the page\. Import a \.zip/)
  })

  it('refuses what it cannot import', async () => {
    await expect(runImport({ data: Buffer.from(''), fileName: 'x.html', by: 'a@nuvho.com', via: 'editor' })).rejects.toBeInstanceOf(ImportError)
    await expect(runImport({ data: Buffer.from('just text'), fileName: 'x.txt', by: 'a@nuvho.com', via: 'editor' })).rejects.toThrow(/not HTML/)
    await expect(runImport({ data: Buffer.from('<html><body><nav>x</nav></body></html>'), fileName: 'x.html', by: 'a@nuvho.com', via: 'editor' })).rejects.toThrow(/No article content/)
  })
})

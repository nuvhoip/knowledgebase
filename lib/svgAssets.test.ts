import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { cleanSvg, cleanCss } from './svgSanitize'
import { collectFaces, embedBrandFonts, parseFontShorthand, brandFamily } from './svgFonts'
import { parseEmbedUrl, isPlayableVideoUrl, isSharePointUrl } from './embeds'
import { readBundle, resolveBundlePath, isZip, BundleError } from './importBundle'
import { isPrivateAddress } from './remoteFetch'
import { sniffType, looksLikeSvg } from './uploads'

describe('cleanSvg', () => {
  it('removes scripts, handlers, foreignObject, animation and external references', () => {
    const r = cleanSvg(`<svg viewBox="0 0 100 50" onload="alert(1)"><script>alert(2)</script>
      <foreignObject><div>x</div></foreignObject><animate attributeName="x"/>
      <a href="https://evil.example"><rect width="10" height="10" fill="url(https://evil.example/#x)"/></a>
      <use href="https://evil.example/s.svg#i"/><use xlink:href="#local"/>
      <image href="https://evil.example/p.png"/><circle r="4" onclick="x()" style="fill:red;background:url(https://e.x/a)"/></svg>`)!
    expect(r.svg).not.toMatch(/script|onload|onclick|foreignObject|animate|evil\.example|e\.x/)
    expect(r.svg).toContain('<rect width="10" height="10"/>') // the remote fill went, the link was unwrapped
    expect(r.svg).toContain('<use xlink:href="#local"/>')
    expect(r.svg).toContain('style="fill:red;background:none"')
    expect(r.dropped).toBeGreaterThanOrEqual(4)
  })

  it('makes a standalone file: xmlns, intrinsic size from the viewBox, attribute case kept', () => {
    const r = cleanSvg('<svg viewBox="0 0 1000 470"><linearGradient id="g" gradientUnits="userSpaceOnUse"/><rect width="5" height="5" fill="url(#g)"/></svg>')!
    expect(r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="470" viewBox="0 0 1000 470">')).toBe(true)
    expect(r.svg).toContain('gradientUnits="userSpaceOnUse"')
    expect(r.svg).toContain('fill="url(#g)"')
    expect([r.width, r.height]).toEqual([1000, 470])
  })

  it('applies what the drawing inherited from the page only when it names none', () => {
    const plain = cleanSvg('<svg viewBox="0 0 10 10"><text fill="currentColor">A</text></svg>', { defaultFontFamily: 'Raleway, sans-serif', defaultColor: '#414B4C' })!
    expect(plain.svg).toContain('font-family="Raleway, sans-serif"')
    expect(plain.svg).toContain('color="#414B4C"')
    const named = cleanSvg('<svg viewBox="0 0 10 10" font-family="Comfortaa"><text>A</text></svg>', { defaultFontFamily: 'Raleway' })!
    expect(named.svg).toContain('font-family="Comfortaa"')
    expect(named.svg).not.toContain('Raleway')
  })

  it('reads the title for alt text and refuses empty drawings', () => {
    expect(cleanSvg('<svg viewBox="0 0 1 1"><title>Flow</title><path d="M0 0"/></svg>')!.title).toBe('Flow')
    expect(cleanSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>')).toBeNull()
    expect(cleanSvg('<div>no svg</div>')).toBeNull()
  })

  it('sees through CSS escapes', () => {
    // CSS source text: u\72l( is url(, @\69mport is @import
    expect(cleanCss(String.raw`a{b:u\72l(https://x.example/a)} @\69mport "x.css";`)).not.toMatch(/x\.example|x\.css|@import/i)
  })

  it('cleans CSS', () => {
    expect(cleanCss('@import url(x.css); a{fill:url(#ok);b:url(https://x)}</style><script>')).toBe(' a{fill:url(#ok);b:none}')
  })
})

describe('brand fonts in drawings', () => {
  it('follows attributes, style, the font shorthand and simple <style> rules', () => {
    const faces = collectFaces(`<svg xmlns="http://www.w3.org/2000/svg" font-family="Raleway, sans-serif">
      <style>.h{font:600 18px/1.2 'Comfortaa', system-ui} text.em{font-style:italic}</style>
      <text>ab</text><text class="h">Hd</text><text font-weight="bold">B</text><text class="em">i</text><text font-family="Inter">x</text></svg>`)
    const keys = Array.from(faces.keys()).sort()
    expect(keys).toEqual(['Comfortaa|normal|600', 'Raleway|italic|400', 'Raleway|normal|400', 'Raleway|normal|700'])
    expect(Array.from(faces.get('Comfortaa|normal|600')!.chars).sort().join('')).toBe('Hd')
  })

  it('parses names and shorthands', () => {
    expect(brandFamily("'Inter', \"Raleway\", sans-serif")).toBe('Raleway')
    expect(brandFamily('Inter, sans-serif')).toBeNull()
    expect(parseFontShorthand('italic 600 14px/1.5 Raleway, sans-serif')).toEqual({ family: 'Raleway, sans-serif', style: 'italic', weight: '600' })
  })

  it('embeds a WOFF2 subset per face actually used', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text font-family="Comfortaa" font-weight="600">Nuvho</text><text font-family="Raleway">PMS</text></svg>'
    const r = await embedBrandFonts(svg)
    expect(r.failed).toEqual([])
    expect(r.faces).toHaveLength(2)
    expect(r.svg).toMatch(/^<svg[^>]*><style>@font-face\{font-family:"Comfortaa";font-weight:600;font-style:normal;src:url\(data:font\/woff2;base64,/)
    expect(r.addedBytes).toBeLessThan(40_000)
  })

  it('leaves drawings without brand text alone', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    expect((await embedBrandFonts(svg)).svg).toBe(svg)
  })
})

describe('embeds', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871/abc123def0', 'https://player.vimeo.com/video/76979871?h=abc123def0'],
    ['https://player.vimeo.com/video/76979871?h=ff00aa11', 'https://player.vimeo.com/video/76979871?h=ff00aa11'],
    ['https://scribehow.com/shared/Month_end__Xy12', 'https://scribehow.com/embed/Month_end__Xy12'],
  ])('%s', (url, src) => {
    expect(parseEmbedUrl(url)?.src).toBe(src)
  })

  it('refuses everything else', () => {
    for (const u of ['https://youtube.com/watch?v=short', 'https://vimeo.com/channels/x', 'https://scribehow.com/page/x', 'https://example.com/embed/x', 'javascript:alert(1)']) {
      expect(parseEmbedUrl(u)).toBeNull()
    }
  })

  it('knows which videos play from a link', () => {
    expect(isPlayableVideoUrl('https://sftp.nuvho.com/publicdownloads/a.mp4')).toBe(true)
    expect(isPlayableVideoUrl('http://sftp.nuvho.com/publicdownloads/a.mp4')).toBe(false)
    expect(isPlayableVideoUrl('https://sftp.nuvho.com.evil.example/a.mp4')).toBe(false)
    expect(isPlayableVideoUrl('/uploads/mabc12-0123456789ab.mp4')).toBe(true)
    expect(isSharePointUrl('https://nuvho-my.sharepoint.com/:v:/p/x')).toBe(true)
  })
})

describe('import bundles', () => {
  const zip = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))

  it('strips a single top folder, ignores hidden files and picks the page', () => {
    const b = readBundle(zip({
      'scratch/.claude/launch.json': '{}',
      'scratch/hotel.html': '<html><body><img src="img/a.png"></body></html>',
      'scratch/img/a.png': 'PNG',
    }))
    expect(b.pageName).toBe('hotel.html')
    expect(Array.from(b.files.keys())).toEqual(['img/a.png'])
    expect(resolveBundlePath(b, './img/a.png')?.name).toBe('img/a.png')
    expect(resolveBundlePath(b, '../img/a.png')).toBeNull()
  })

  it('prefers the manifest, then index.html, and lists the pages it did not use', () => {
    expect(readBundle(zip({ 'a.html': '<p>a</p>', 'b.html': '<p>bb</p>', 'manifest.json': '{"page":"a.html"}' })).pageName).toBe('a.html')
    const b = readBundle(zip({ 'index.html': '<p>i</p>', 'preview.html': '<p>longer preview</p>' }))
    expect(b.pageName).toBe('index.html')
    expect(b.notes[0]).toMatch(/preview\.html/)
  })

  it('refuses archives without a page or that are not zips', () => {
    expect(() => readBundle(zip({ 'a.png': 'x' }))).toThrow(BundleError)
    expect(isZip(Buffer.from('<html>'))).toBe(false)
  })
})

describe('remote fetch guard', () => {
  it.each(['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::7f00:1', '64:ff9b::a00:1', '::ffff:0:0'])('blocks IPv4-in-IPv6 %s', ip => {
    expect(isPrivateAddress(ip)).toBe(true)
  })
  it.each(['10.126.0.14', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1', 'fe80::1'])('blocks %s', ip => {
    expect(isPrivateAddress(ip)).toBe(true)
  })
  it.each(['104.16.0.1', '209.38.19.222', '2606:4700::1111'])('allows %s', ip => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('upload type sniffing', () => {
  it('recognises MP4 but not HEIC or QuickTime', () => {
    const box = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp' + brand + '\0\0\0\0')])
    expect(sniffType(box('isom'))).toBe('video/mp4')
    expect(sniffType(box('mp42'))).toBe('video/mp4')
    expect(sniffType(box('heic'))).toBeNull()
    expect(sniffType(box('qt  '))).toBeNull()
  })

  it('recognises SVG after an XML declaration, comment or doctype', () => {
    expect(looksLikeSvg(Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"/>'))).toBe(true)
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml')
    expect(looksLikeSvg(Buffer.from('<html><svg></svg></html>'))).toBe(false)
  })
})

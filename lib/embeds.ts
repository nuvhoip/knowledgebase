// Video and embeds in articles (decision 24 Nov 2026, NUVCL-201):
//   - YouTube, Vimeo and Scribe embeds, normalised to one canonical player URL each
//   - MP4 files uploaded to the KB (/uploads/<id>.mp4, up to 100 MB)
//   - MP4 links on our own public file server (sftp.nuvho.com/publicdownloads), played from
//     the link, not copied
// SharePoint / Stream video is NOT supported: it only plays for viewers signed into
// Nuvho's Microsoft 365, so it stays a plain link.
//
// Shared by the importer (lib/htmlImport.ts), the sanitiser (lib/sanitize.ts) and the editor's
// Media menu (components/editor/TinyEditor.tsx), so all three agree on what is allowed.

export type EmbedProvider = 'youtube' | 'vimeo' | 'scribe'

export interface Embed {
  provider: EmbedProvider
  /** Canonical player URL: the only form stored in article HTML. */
  src: string
}

/** Hosts an <iframe> may point at once normalised (lib/sanitize.ts allowedIframeHostnames). */
export const EMBED_IFRAME_HOSTS = ['www.youtube-nocookie.com', 'player.vimeo.com', 'scribehow.com'] as const

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const SCRIBE_SLUG = /^[A-Za-z0-9_-]{4,200}$/

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

/** Turns any YouTube / Vimeo / Scribe watch, share or embed URL into the canonical embed. */
export function parseEmbedUrl(url: string): Embed | null {
  const u = parse(url)
  if (!u) return null
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id = ''
    if (host === 'youtu.be') id = parts[0] ?? ''
    else if (parts[0] === 'watch') id = u.searchParams.get('v') ?? ''
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? ''
    if (!YT_ID.test(id)) return null
    const start = Number.parseInt(u.searchParams.get('start') ?? u.searchParams.get('t') ?? '', 10)
    const q = Number.isFinite(start) && start > 0 ? `?start=${start}` : ''
    return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}${q}` }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/<id>, vimeo.com/<id>/<hash>, player.vimeo.com/video/<id>?h=<hash>
    const ids = host === 'player.vimeo.com' && parts[0] === 'video' ? parts.slice(1) : parts
    const id = ids[0] ?? ''
    if (!/^\d{4,12}$/.test(id)) return null
    const hash = u.searchParams.get('h') ?? (ids[1] && /^[a-f0-9]{6,20}$/i.test(ids[1]) ? ids[1] : '')
    return { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}` }
  }

  if (host === 'scribehow.com') {
    // scribehow.com/shared/<slug> and scribehow.com/embed/<slug>
    if ((parts[0] === 'shared' || parts[0] === 'embed') && SCRIBE_SLUG.test(parts[1] ?? '')) {
      return { provider: 'scribe', src: `https://scribehow.com/embed/${parts[1]}` }
    }
    return null
  }
  return null
}

const PROVIDER_TITLE: Record<EmbedProvider, string> = {
  youtube: 'YouTube video',
  vimeo: 'Vimeo video',
  scribe: 'Scribe guide',
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Article HTML for an embed: a responsive frame (.nw-embed) around the player. */
export function embedHtml(embed: Embed, title?: string): string {
  const t = escAttr(title?.trim() || PROVIDER_TITLE[embed.provider])
  const allow = embed.provider === 'scribe'
    ? 'fullscreen'
    : 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
  return `<div class="nw-embed nw-embed--${embed.provider}"><iframe src="${escAttr(embed.src)}" title="${t}"`
    + ` loading="lazy" allow="${allow}" allowfullscreen="allowfullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
}

// ── MP4 links played from our own file server ────────────────────────────────

/** Hosts whose MP4 links play from the link (KB_VIDEO_LINK_HOSTS, comma-separated, overrides). */
export function videoLinkHosts(): string[] {
  const env = typeof process !== 'undefined' ? process.env.KB_VIDEO_LINK_HOSTS : undefined
  const list = (env ?? 'sftp.nuvho.com').split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
  return list.length ? list : ['sftp.nuvho.com']
}

/** An https .mp4 / .webm URL on an allowed host, or a KB upload (/uploads/<id>.mp4). */
export function isPlayableVideoUrl(url: string, hosts: string[] = videoLinkHosts()): boolean {
  const v = url.trim()
  if (/^\/uploads\/[a-z0-9]+-[a-f0-9]{12}\.mp4$/.test(v)) return true
  const u = parse(v)
  if (!u || u.protocol !== 'https:') return false
  return hosts.includes(u.hostname.toLowerCase()) && /\.(mp4|m4v|webm)$/i.test(u.pathname)
}

/** True for SharePoint / OneDrive / Stream links, which are not playable for public readers. */
export function isSharePointUrl(url: string): boolean {
  const u = parse(url)
  if (!u) return false
  const h = u.hostname.toLowerCase()
  return h.endsWith('.sharepoint.com') || h === 'stream.microsoft.com' || h.endsWith('.onedrive.com') || h === '1drv.ms'
}

/** Article HTML for a video file. */
export function videoHtml(src: string, opts: { poster?: string; caption?: string } = {}): string {
  const poster = opts.poster ? ` poster="${escAttr(opts.poster)}"` : ''
  const video = `<video class="nw-video" src="${escAttr(src)}" controls="controls" preload="metadata" playsinline="playsinline"${poster}></video>`
  return opts.caption?.trim()
    ? `<figure class="nw-figure">${video}<figcaption>${escAttr(opts.caption.trim())}</figcaption></figure>`
    : `<figure class="nw-figure">${video}</figure>`
}

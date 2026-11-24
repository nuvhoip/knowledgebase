import https from 'https'
import dns from 'dns'
import net from 'net'
import type { LookupFunction } from 'net'

// Downloads an image a page links to, so the article keeps its own copy (decision
// 24 Nov 2026: external images are re-hosted, not hotlinked).
//
// The URL comes from an uploaded page, so this must not become a way to reach the KB's
// private network (the database and file server sit on a VPC): https only, standard port,
// every DNS answer checked against private / loopback / link-local / metadata ranges *at
// connect time* (so a rebinding DNS answer cannot slip through), at most 3 redirects, each
// re-checked, a size cap and a timeout.

export class RemoteFetchError extends Error {}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}

/** True for any address that is not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip)
    return BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return (n & mask) === (v4ToInt(base) & mask)
    })
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (v === '::' || v === '::1') return true
    // IPv4 inside IPv6, dotted or hex: ::ffff:10.0.0.1, ::ffff:a00:1, ::a00:1 (deprecated
    // "compatible" form), 64:ff9b::a00:1 (NAT64). Decode and check the IPv4 address.
    const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (dotted) return isPrivateAddress(dotted[1])
    const hex = /^(?:::ffff:|::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v)
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16 | parseInt(hex[2], 16)) >>> 0
      return isPrivateAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
    }
    return /^(?:fc|fd|fe[89ab]|ff)/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8') || v.startsWith('::ffff:')
  }
  return true
}

/** DNS lookup that refuses private answers (used by the socket itself, so no TOCTOU gap). */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as (e: Error | null, a?: unknown, f?: number) => void)(err)
    const list = (addresses as unknown as dns.LookupAddress[])
    const bad = list.find(a => isPrivateAddress(a.address))
    if (bad || !list.length) {
      return (callback as (e: Error | null) => void)(new RemoteFetchError(`${hostname} resolves to a private address`))
    }
    if ((options as dns.LookupOptions).all) return (callback as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    return (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family)
  })
}

export interface Fetched {
  body: Buffer
  /** The type the server claimed (never trusted: callers sniff the bytes). */
  contentType: string
  finalUrl: string
}

export interface FetchOptions {
  maxBytes: number
  timeoutMs?: number
  maxRedirects?: number
}

function checkUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new RemoteFetchError('Not a valid URL') }
  if (u.protocol !== 'https:') throw new RemoteFetchError('Only https links can be copied')
  if (u.port && u.port !== '443') throw new RemoteFetchError('Only the standard https port is allowed')
  if (u.username || u.password) throw new RemoteFetchError('Links with credentials are not copied')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  // An IP-literal host never goes through DNS (so not through safeLookup): IPv6 literals are
  // refused outright, IPv4 literals must be public.
  if (net.isIPv6(host)) throw new RemoteFetchError('Links to IPv6 addresses are not copied')
  if (net.isIPv4(host) && isPrivateAddress(host)) throw new RemoteFetchError('Private addresses are not allowed')
  return u
}

function getOnce(u: URL, opts: Required<FetchOptions>, deadline: number): Promise<{ redirect?: string; fetched?: Fetched }> {
  return new Promise((resolve, reject) => {
    // Socket `timeout` only catches an idle connection; this caps the whole download, so a
    // server trickling a byte every few seconds cannot hold a worker for hours.
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new RemoteFetchError('The download timed out'))
    const timer = setTimeout(() => req.destroy(new RemoteFetchError('The download timed out')), remaining)
    const done = <T>(fn: (v: T) => void) => (v: T) => { clearTimeout(timer); fn(v) }
    resolve = done(resolve)
    reject = done(reject)
    const req = https.get(u, {
      lookup: safeLookup,
      timeout: opts.timeoutMs,
      headers: { 'User-Agent': 'NuvhoKnowledgeBase-Import/1.0', Accept: 'image/*,video/mp4;q=0.9,*/*;q=0.5' },
    }, res => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        return resolve({ redirect: new URL(res.headers.location, u).toString() })
      }
      if (status !== 200) {
        res.resume()
        return reject(new RemoteFetchError(`The server answered ${status}`))
      }
      const declared = Number(res.headers['content-length'])
      if (declared && declared > opts.maxBytes) {
        res.destroy()
        return reject(new RemoteFetchError(`The file is larger than ${Math.round(opts.maxBytes / 1048576)} MB`))
      }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > opts.maxBytes) {
          res.destroy()
          reject(new RemoteFetchError(`The file is larger than ${Math.round(opts.maxBytes / 1048576)} MB`))
          return
        }
        chunks.push(c)
      })
      res.on('end', () => resolve({
        fetched: { body: Buffer.concat(chunks), contentType: String(res.headers['content-type'] ?? ''), finalUrl: u.toString() },
      }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new RemoteFetchError('The download timed out')))
    req.on('error', err => reject(err instanceof RemoteFetchError ? err : new RemoteFetchError(err.message)))
  })
}

/** Downloads one https URL within the limits. Throws RemoteFetchError with a readable reason. */
export async function fetchRemote(raw: string, options: FetchOptions): Promise<Fetched> {
  const opts: Required<FetchOptions> = { timeoutMs: 15000, maxRedirects: 3, ...options }
  // The whole fetch, redirects included: twice the idle timeout, at least 30 s
  const deadline = Date.now() + Math.max(30000, opts.timeoutMs * 2)
  let url = checkUrl(raw)
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const r = await getOnce(url, opts, deadline)
    if (r.fetched) return r.fetched
    url = checkUrl(r.redirect!)
  }
  throw new RemoteFetchError('Too many redirects')
}

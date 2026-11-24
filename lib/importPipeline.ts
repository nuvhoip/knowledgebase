import { createHash } from 'crypto'
import { convertArticleHtml, resolveAssetPlaceholders, IMPORTER_VERSION, type PendingAsset } from '@/lib/htmlImport'
import { readBundle, resolveBundlePath, isZip, BundleError, type Bundle } from '@/lib/importBundle'
import { AssetError, decodeDataUri, storeBytes, storeRemote, storeSvg, type StoredAsset } from '@/lib/assetStore'
import { findImportedUpload, recordImport, type ImportAssetRecord } from '@/lib/importDb'

// Server-side import (decision 24 Nov 2026, NUVCL-201). One pipeline for both ways in:
//   - the editor's Import menu (POST /api/admin/import, staff session): converts, stores the
//     assets and returns the article for review; Save attaches the import to the article
//   - the nuvho-knowledge-save skill (POST /api/admin/import with a personal token and
//     mode=submit): the same, then a PENDING article is created or updated
//
// Page → lib/htmlImport.ts (convert + collect assets) → each asset stored (lib/assetStore.ts)
// → placeholders swapped for /uploads/… URLs → sanitised → import recorded (lib/importDb.ts).

export const MAX_PAGE_BYTES = 8 * 1024 * 1024
const MAX_ASSETS = 120

export class ImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export interface ImportInput {
  data: Buffer
  /** File name as uploaded ('pasted HTML' for the paste dialog). */
  fileName: string
  pasted?: boolean
  by: string
  via: 'editor' | 'claude'
}

export interface ImportedAssetSummary {
  position: number
  kind: PendingAsset['kind']
  role: PendingAsset['role']
  ref: string
  url: string | null
  error: string | null
}

export interface ImportOutcome {
  importId: string | null
  importer: string
  title: string
  description: string
  tags: string[]
  html: string
  notes: string[]
  assets: ImportedAssetSummary[]
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

async function storeOne(a: PendingAsset, bundle: Bundle | null, by: string, defaults: { fontFamily: string; color: string }): Promise<StoredAsset> {
  const svgDefaults = { defaultFontFamily: defaults.fontFamily, defaultColor: defaults.color }
  const accept = a.kind === 'video' ? 'video' : 'image'
  // A re-export of the same page reuses files it stored before instead of storing copies
  const reuse = findImportedUpload
  switch (a.source.type) {
    case 'svg':
      return storeSvg(a.source.svg, by, svgDefaults, reuse)
    case 'data':
      return storeBytes(decodeDataUri(a.source.uri), by, accept, svgDefaults, reuse)
    case 'url':
      return storeRemote(a.source.url, by, accept, svgDefaults, reuse)
    case 'path': {
      const hit = bundle ? resolveBundlePath(bundle, a.source.path) : null
      if (!hit) {
        throw new AssetError(bundle
          ? `${a.source.path} is not in the .zip.`
          : `${a.source.path} is a file next to the page. Import a .zip of the page with its files to keep it.`)
      }
      return storeBytes(hit.data, by, accept, svgDefaults, reuse)
    }
  }
}

export async function runImport(input: ImportInput): Promise<ImportOutcome> {
  if (!input.data.length) throw new ImportError('The file is empty.')

  let bundle: Bundle | null = null
  let page: string
  let pageName = input.fileName
  const notes: string[] = []
  if (isZip(input.data)) {
    try {
      bundle = readBundle(input.data)
    } catch (err) {
      if (err instanceof BundleError) throw new ImportError(err.message, 422)
      throw err
    }
    page = bundle.html
    if (Buffer.byteLength(page, 'utf8') > MAX_PAGE_BYTES) throw new ImportError(`The page in the .zip (${bundle.pageName}) is larger than 8 MB.`, 413)
    pageName = `${input.fileName} → ${bundle.pageName}`
    notes.push(...bundle.notes)
  } else {
    if (input.data.length > MAX_PAGE_BYTES) throw new ImportError('That HTML page is larger than 8 MB.', 413)
    page = input.data.toString('utf8').replace(/^﻿/, '')
    if (!/<[a-z!]/i.test(page)) throw new ImportError('That file is not HTML.', 415)
  }

  const converted = convertArticleHtml(page)
  if (!converted.html) throw new ImportError('No article content was found in that HTML.', 422)
  if (converted.assets.length > MAX_ASSETS) {
    throw new ImportError(`The page has ${converted.assets.length} images, drawings and videos; the limit is ${MAX_ASSETS}.`, 422)
  }

  // Store the assets (a few at a time: SFTP writes and remote downloads are I/O bound)
  const results: (StoredAsset | AssetError)[] = new Array(converted.assets.length)
  let next = 0
  async function worker() {
    while (next < converted.assets.length) {
      const i = next++
      try {
        results[i] = await storeOne(converted.assets[i], bundle, input.by, converted.svgDefaults)
      } catch (err) {
        if (err instanceof AssetError) results[i] = err
        else {
          console.error('[import] asset failed', converted.assets[i].ref, err)
          results[i] = new AssetError('It could not be saved (storage error).')
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])

  const urls: Record<string, { src: string; width?: number; height?: number } | null> = {}
  const records: ImportAssetRecord[] = []
  converted.assets.forEach((a, i) => {
    const r = results[i]
    const ok = !(r instanceof AssetError)
    urls[a.id] = ok ? { src: r.url, width: r.width, height: r.height } : null
    records.push({
      position: i + 1, kind: a.kind, role: a.role, uploadId: ok ? r.uploadId : null, url: ok ? r.url : null,
      sourceRef: a.ref, alt: a.alt || (ok ? r.alt ?? '' : ''), width: ok ? r.width ?? null : null,
      height: ok ? r.height ?? null : null, error: ok ? null : r.message, sha256: ok ? r.sha256 : null,
    })
  })

  const html = resolveAssetPlaceholders(converted.html, urls)
  if (!html) throw new ImportError('No article content was found in that HTML.', 422)

  const stored = records.filter(r => r.url)
  const failed = records.filter(r => !r.url)
  if (stored.length) {
    const kinds = [
      [stored.filter(r => r.kind === 'svg' && r.role !== 'icon').length, 'drawing', 'drawings'],
      [stored.filter(r => r.role === 'icon').length, 'icon', 'icons'],
      [stored.filter(r => r.kind === 'image').length, 'image', 'images'],
      [stored.filter(r => r.kind === 'video').length, 'video', 'videos'],
    ].filter(([n]) => (n as number) > 0).map(([n, one, many]) => plural(n as number, one as string, many as string))
    notes.unshift(`Kept ${kinds.join(', ')} in place, stored on the Knowledge Base. They are listed under Assets.`)
  }
  for (const f of failed) notes.push(`Could not keep ${f.sourceRef}: ${f.error}`)
  notes.push(...converted.notes)

  const importId = await recordImport({
    sourceName: pageName,
    sourceKind: bundle ? 'zip' : input.pasted ? 'paste' : 'html',
    sourceSha256: createHash('sha256').update(input.data).digest('hex'),
    sourceBytes: input.data.length,
    sourceHtml: page,
    title: converted.title,
    description: converted.description,
    importedHtml: html,
    notes,
    importerVersion: IMPORTER_VERSION,
    via: input.via,
    createdBy: input.by,
    assets: records,
  }).catch(err => {
    // The article is still usable without its import record (no Assets panel / restore)
    console.error('[import] could not record the import', err)
    return null
  })

  return {
    importId,
    importer: IMPORTER_VERSION,
    title: converted.title,
    description: converted.description,
    tags: converted.tags,
    html,
    notes,
    assets: records.map(r => ({ position: r.position, kind: r.kind, role: r.role, ref: r.sourceRef, url: r.url, error: r.error })),
  }
}

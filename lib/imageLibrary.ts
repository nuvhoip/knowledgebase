// Image library — curated photos from the Marketing SharePoint Image Repository, imported
// as a snapshot by scripts/import-image-library.mjs into nuvho_kb.image_library
// (scripts/008_image_library.sql). Image bytes are ordinary rows in nuvho_kb.uploads, so a
// picked photo is referenced by its existing /uploads/<id>.jpg URL.
//
// Types and pure helpers only — safe to import from client components. The database
// query lives in lib/imageLibraryDb.ts.

export interface LibraryImage {
  id: string
  /** Folder path inside the repository, e.g. 'Regions/UK/UK London' */
  collection: string
  title: string
  credit: string | null
  width: number
  height: number
  /** 2400px JPEG — what the article hero stores */
  url: string
  /** 480px JPEG for the picker grid */
  thumbUrl: string
}

export interface LibraryCollection {
  /** Full folder path, used as the filter key */
  path: string
  /** Top-level folder, e.g. 'Regions' */
  group: string
  /** Remaining path, e.g. 'UK › UK London' (the group itself when there is no sub-folder) */
  label: string
  count: number
}

/** Group image counts by folder for the picker's filter list. */
export function buildCollections(images: Pick<LibraryImage, 'collection'>[]): LibraryCollection[] {
  const counts = new Map<string, number>()
  for (const img of images) counts.set(img.collection, (counts.get(img.collection) ?? 0) + 1)
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, count]) => {
      const [group, ...rest] = path.split('/')
      return { path, group, label: rest.length ? rest.join(' › ') : group, count }
    })
}

/** Case-insensitive match on title, credit and folder path; every word must match. */
export function matchesQuery(img: Pick<LibraryImage, 'title' | 'credit' | 'collection'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${img.title} ${img.credit ?? ''} ${img.collection}`.toLowerCase()
  return words.every(w => hay.includes(w))
}

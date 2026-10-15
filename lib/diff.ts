// Line diff for the version history panel: article HTML is reduced to its readable text
// (one line per paragraph, heading, list item or table row) and compared with a plain LCS.
// Deliberately simple — no dependency, and good enough to see what changed between versions.

import { decodeEntities } from './toc'

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string }

/** Above this many LCS cells the comparison is skipped rather than freezing the browser. */
export const MAX_DIFF_CELLS = 4_000_000

const BLOCK_END = /<\/(?:p|h[1-6]|li|tr|div|section|blockquote|pre|figcaption|dt|dd|caption)\s*>|<br\s*\/?>|<hr\s*\/?>/gi

/** Readable text of an article's HTML, one block per line. */
export function htmlToLines(html: string | null | undefined): string[] {
  if (!html) return []
  return decodeEntities(
    html
      .replace(/<(?:td|th)[^>]*>/gi, ' | ')   // keep table cells apart
      .replace(/<img[^>]*\salt="([^"]*)"[^>]*>/gi, ' [image: $1] ')
      .replace(BLOCK_END, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim().replace(/^\|\s*/, ''))
    .filter(Boolean)
}

/** Line diff from `before` to `after`, or null when the inputs are too large to compare. */
export function diffLines(before: string[], after: string[]): DiffOp[] | null {
  // Trim the common head and tail first: most edits touch a small part of the article
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endB = before.length
  let endA = after.length
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) { endB--; endA-- }

  const a = before.slice(start, endB)
  const b = after.slice(start, endA)
  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) return null

  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const ops: DiffOp[] = before.slice(0, start).map(text => ({ type: 'same' as const, text }))
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ type: 'same', text: a[i] }); i++; j++ }
    // Removals before additions, so an edited line reads "- old / + new"
    else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push({ type: 'del', text: a[i] }); i++ }
    else { ops.push({ type: 'add', text: b[j] }); j++ }
  }
  before.slice(endB).forEach(text => ops.push({ type: 'same', text }))
  return ops
}

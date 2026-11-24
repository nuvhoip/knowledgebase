// Entry point for the importer bundle the nuvho-knowledge-save skill ships (HTML mode).
// Built into one self-contained file by scripts/build-skill-importer.mjs; never run from here.
//
//   node kb-import.cjs --version
//   node kb-import.cjs <page.html> <out_dir>
//
// Writes <out_dir>/article.html (the article HTML exactly as the editor's Import → HTML file
// makes it, already sanitised, ending in one newline) and <out_dir>/import.json (importer
// version, title, description, notes, byte count and sha256 of article.html). Exit code 1 when
// no article content was found.

import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { importArticleHtml } from '@/lib/htmlImport'

declare const KB_IMPORTER_VERSION: string

const [arg, outDir] = process.argv.slice(2)

if (arg === '--version') {
  process.stdout.write(KB_IMPORTER_VERSION + '\n')
  process.exit(0)
}
if (!arg || !outDir) {
  process.stderr.write('Usage: node kb-import.cjs <page.html> <out_dir>   |   node kb-import.cjs --version\n')
  process.exit(2)
}

const result = importArticleHtml(readFileSync(arg, 'utf8'))
const article = result.html ? result.html + '\n' : ''
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'article.html'), article, 'utf8')

const report = {
  importer: KB_IMPORTER_VERSION,
  title: result.title,
  description: result.description,
  notes: result.notes,
  article_html: join(outDir, 'article.html'),
  article_bytes: Buffer.byteLength(article, 'utf8'),
  article_sha256: createHash('sha256').update(article, 'utf8').digest('hex'),
}
writeFileSync(join(outDir, 'import.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
process.exit(result.html ? 0 : 1)

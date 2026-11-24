// Builds the importer bundle for the nuvho-knowledge-save skill (HTML mode):
//
//   npm run build:skill-importer -- <out.cjs>
//
// One self-contained CommonJS file (lib/htmlImport.ts + lib/articleComponents.ts +
// lib/sanitize.ts + their packages) that runs on Node 18+ with no install. Copy it into the
// skill as scripts/kb-import.cjs and ship a new skill version. Rebuild it whenever one of
// those three files changes, so articles saved by the skill match the editor's Import menu.
//
// The version string records the date, the commit, whether the tree had uncommitted changes
// and a hash of the three source files, e.g.
//   kb-import 2026-11-19 5d023fc+dirty src:3f9a1c0b2d4e
// The skill prints it in its report.

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2]
if (!out) {
  console.error('Usage: npm run build:skill-importer -- <out.cjs>')
  process.exit(2)
}

let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  console.error('esbuild is not installed (it normally comes with vitest). Run npm install first.')
  process.exit(1)
}

const SOURCES = ['lib/htmlImport.ts', 'lib/articleComponents.ts', 'lib/sanitize.ts']
const srcHash = createHash('sha256')
for (const f of SOURCES) srcHash.update(readFileSync(join(root, f)))

function git(cmd) {
  try { return execSync(`git ${cmd}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}
const commit = git('rev-parse --short HEAD') || 'nogit'
const dirty = git(`status --porcelain -- ${SOURCES.join(' ')}`) ? '+dirty' : ''
const day = new Date().toISOString().slice(0, 10)
const version = `kb-import ${day} ${commit}${dirty} src:${srcHash.digest('hex').slice(0, 12)}`

await esbuild.build({
  entryPoints: [join(root, 'scripts/kb-import-cli.ts')],
  outfile: resolve(out),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  minify: true,
  legalComments: 'eof',
  tsconfig: join(root, 'tsconfig.json'),
  define: { KB_IMPORTER_VERSION: JSON.stringify(version) },
  banner: { js: `// ${version} — built from knowledge-nuvho by scripts/build-skill-importer.mjs. Do not edit.` },
  logLevel: 'warning',
})
console.log(`${version}\n→ ${resolve(out)}`)

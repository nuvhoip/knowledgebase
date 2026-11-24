/** @type {import('next').NextConfig} */

// Routes that store imported drawings: they subset the brand fonts (lib/svgFonts.ts) with
// harfbuzz (WebAssembly, read from node_modules at runtime) from the TTFs in app/fonts.
// Neither is a static import, so standalone output tracing is told to ship them.
const FONT_ASSETS = ['./app/fonts/*.ttf', './node_modules/harfbuzzjs/dist/*.wasm']

const nextConfig = {
  output: 'standalone',
  images: {
    domains: [],
  },
  experimental: {
    // instrumentation.ts: refuse to start with missing or invalid image-storage settings
    instrumentationHook: true,
    // ssh2 (image file store, lib/fileStore.mjs) loads optional native add-ons; keep it
    // out of the webpack bundle and load it from node_modules at runtime. subset-font loads
    // harfbuzz's .wasm with require.resolve, which only works unbundled.
    serverComponentsExternalPackages: ['ssh2', 'subset-font', 'harfbuzzjs', 'fontverter'],
    // Keys are globs over route paths (a literal "[slug]" would read as a character class)
    outputFileTracingIncludes: {
      '/api/admin/**': FONT_ASSETS,
    },
  },
}

module.exports = nextConfig

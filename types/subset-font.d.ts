// subset-font 2.x (CommonJS, no bundled types) — used by lib/svgFonts.ts
declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2'
    preserveNameIds?: number[]
    variationAxes?: Record<string, number | { min: number; max: number; default?: number }>
    noLayoutClosure?: boolean
  }
  function subsetFont(font: Buffer, text: string, options?: SubsetOptions): Promise<Buffer>
  export = subsetFont
}

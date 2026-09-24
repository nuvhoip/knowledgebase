'use client'

import dynamic from 'next/dynamic'
import type { RichTextEditorProps } from './editor/TinyEditor'

// Client-only wrapper: TinyMCE reads `window` at import, so the heavy module is loaded
// with ssr: false and only on pages that render an editor (Edit page, admin dashboard).
const RichTextEditor = dynamic<RichTextEditorProps>(() => import('./editor/TinyEditor'), {
  ssr: false,
  loading: () => (
    <div className="na-editor na-editor--loading" aria-busy="true">
      <div className="na-editor__toolbar" />
      <div className="na-editor__body" style={{ minHeight: 360 }}>
        <span className="nv-spin nv-spin--sm" />
        <span>Loading editor…</span>
      </div>
    </div>
  ),
})

export default RichTextEditor

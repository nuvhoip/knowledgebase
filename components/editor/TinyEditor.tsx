'use client'

// Self-hosted TinyMCE 8 (GPL v2+, licenseKey "gpl") bundled into the client chunk.
// No Tiny Cloud, no API key, no runtime request to tiny.cloud — the skin registers itself
// through tinymce.Resource when skin.js is imported. Only ever loaded through
// components/RichTextEditor.tsx (next/dynamic, ssr: false) because tinymce touches
// `window` at import time.
//
// Inline mode: the editable region is a real <div> in the page, not an iframe, so it
// inherits the self-hosted next/font faces and the .nw-prose article styles — authors
// see what readers get. The toolbar is pinned into our own container
// (fixed_toolbar_container + toolbar_persist) so the whole thing reads as one field.

import { useId, useRef } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import type { Editor as TinyMCEEditor } from 'tinymce'

import 'tinymce/tinymce'
import 'tinymce/models/dom'
import 'tinymce/themes/silver'
import 'tinymce/icons/default'
import 'tinymce/skins/ui/oxide/skin.js'
import 'tinymce/skins/ui/oxide/content.inline.js'

import 'tinymce/plugins/advlist'
import 'tinymce/plugins/anchor'
import 'tinymce/plugins/autolink'
import 'tinymce/plugins/code'
import 'tinymce/plugins/image'
import 'tinymce/plugins/link'
import 'tinymce/plugins/lists'
import 'tinymce/plugins/searchreplace'
import 'tinymce/plugins/table'
import 'tinymce/plugins/visualblocks'
import 'tinymce/plugins/wordcount'

import { ACCEPTED_IMAGE_TYPES, uploadImage } from '@/lib/uploadClient'
import { ARTICLE_ICONS, SNIPPETS, iconHtml, isArticleIcon } from '@/lib/articleComponents'
import type { ImportResult } from '@/lib/htmlImport'

export interface ImportedMeta {
  title: string
  description: string
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  id?: string
  placeholder?: string
  /** Minimum height of the writing area in px (the area grows with content). */
  minHeight?: number
  disabled?: boolean
  /** Called after Import HTML with the page's title and description, so the form can fill empty fields. */
  onImport?: (meta: ImportedMeta) => void
}

// Components menu + Import (lib/articleComponents.ts, lib/htmlImport.ts). Both only insert
// ordinary article HTML; the save path sanitises it like anything typed by hand.
function registerArticleTools(
  editor: TinyMCEEditor,
  onChange: { current: (html: string) => void },
  onImport: { current: ((meta: ImportedMeta) => void) | undefined },
) {
  const insert = (key: keyof typeof SNIPPETS) => () => editor.insertContent(SNIPPETS[key].html)
  const item = (key: keyof typeof SNIPPETS, text = SNIPPETS[key].label) =>
    ({ type: 'menuitem' as const, text, onAction: insert(key) })

  function openIconDialog() {
    editor.windowManager.open({
      title: 'Insert icon',
      body: {
        type: 'panel',
        items: [
          { type: 'selectbox', name: 'icon', label: 'Brand icon', items: ARTICLE_ICONS.map(n => ({ text: n, value: n })) },
          { type: 'htmlpanel', html: '<p style="margin:8px 0 0;font-size:13px;opacity:.75">Icons are decorative: put the meaning in the text next to them. At the start of a heading, an icon sizes itself to the heading.</p>' },
        ],
      },
      initialData: { icon: 'lightbulb' },
      buttons: [
        { type: 'cancel', text: 'Cancel' },
        { type: 'submit', text: 'Insert', buttonType: 'primary' },
      ],
      onSubmit: api => {
        const { icon } = api.getData() as { icon: string }
        if (isArticleIcon(icon)) editor.insertContent(iconHtml(icon))
        api.close()
      },
    })
  }

  editor.ui.registry.addMenuButton('nwcomponents', {
    text: 'Components',
    tooltip: 'Insert a callout, cards, steps, table, badge or icon',
    fetch: done => done([
      { type: 'nestedmenuitem', text: 'Callout', getSubmenuItems: () => [item('calloutTip', 'Tip'), item('calloutInfo', 'Note'), item('calloutRisk', 'Risk'), item('calloutOk', 'Success')] },
      { type: 'nestedmenuitem', text: 'Cards', getSubmenuItems: () => [item('cards2', '2 columns'), item('cards3', '3 columns')] },
      item('steps'),
      item('table'),
      { type: 'nestedmenuitem', text: 'Badge', getSubmenuItems: () => [item('badgeNeutral', 'Neutral'), item('badgeOk', 'Success'), item('badgeRisk', 'Risk')] },
      { type: 'menuitem', text: 'Icon…', onAction: openIconDialog },
      { type: 'separator' },
      item('cta'),
      item('fineprint'),
      item('divider'),
    ]),
  })

  async function runImport(source: string) {
    editor.setProgressState(true)
    let data: ImportResult & { error?: string }
    try {
      const res = await fetch('/api/admin/import-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: source }),
      })
      data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Import failed (${res.status}).`)
    } catch (err) {
      editor.notificationManager.open({ text: err instanceof Error ? err.message : 'Import failed.', type: 'error' })
      return
    } finally {
      editor.setProgressState(false)
    }

    const apply = () => {
      editor.undoManager.transact(() => editor.setContent(data.html))
      onChange.current(editor.getContent())
      onImport.current?.({ title: data.title, description: data.description })
      editor.notificationManager.open({
        text: ['Imported. Review it before you save.', ...data.notes].join(' '),
        type: 'info',
        timeout: 15000,
      })
    }
    if (editor.getContent({ format: 'text' }).trim()) {
      editor.windowManager.confirm('Replace the current article content with the imported HTML? Undo brings it back.', ok => { if (ok) apply() })
    } else {
      apply()
    }
  }

  function pickFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm,text/html'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) runImport(await file.text())
    }
    input.click()
  }

  function openPasteDialog() {
    editor.windowManager.open({
      title: 'Import HTML',
      size: 'large',
      body: {
        type: 'panel',
        items: [{ type: 'textarea', name: 'html', label: 'Paste the HTML of a page or article', placeholder: '<!DOCTYPE html>…', maximized: true }],
      },
      initialData: { html: '' },
      buttons: [
        { type: 'cancel', text: 'Cancel' },
        { type: 'submit', text: 'Import', buttonType: 'primary' },
      ],
      onSubmit: api => {
        const { html } = api.getData() as { html: string }
        api.close()
        if (html.trim()) runImport(html)
      },
    })
  }

  editor.ui.registry.addMenuButton('nwimport', {
    text: 'Import',
    tooltip: 'Turn a standalone HTML page into this article',
    fetch: done => done([
      { type: 'menuitem', text: 'HTML file…', onAction: pickFile },
      { type: 'menuitem', text: 'Paste HTML…', onAction: openPasteDialog },
    ]),
  })
}

export default function TinyEditor({
  value, onChange, id, placeholder = 'Write the article…', minHeight = 360, disabled = false, onImport,
}: RichTextEditorProps) {
  const toolbarId = `na-editor-toolbar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const editorRef = useRef<TinyMCEEditor | null>(null)
  // init runs once, so the menus read the latest callbacks through refs
  const onChangeRef = useRef(onChange)
  const onImportRef = useRef(onImport)
  onChangeRef.current = onChange
  onImportRef.current = onImport

  return (
    <div className={`na-editor${disabled ? ' na-editor--disabled' : ''}`}>
      <div id={toolbarId} className="na-editor__toolbar" />
      <div className="na-editor__body" style={{ minHeight }}>
        <Editor
          id={id}
          licenseKey="gpl"
          inline
          value={value}
          disabled={disabled}
          onEditorChange={html => onChange(html)}
          onInit={(_evt, editor) => {
            editorRef.current = editor
            // Same class the article page uses, so the writing surface matches the reader.
            editor.getBody().classList.add('nw-prose')
          }}
          init={{
            menubar: false,
            placeholder,
            fixed_toolbar_container: `#${toolbarId}`,
            toolbar_persist: true,
            toolbar_mode: 'wrap',
            plugins: 'advlist anchor autolink code image link lists searchreplace table visualblocks wordcount',
            toolbar:
              'undo redo | blocks | bold italic underline strikethrough | link image table | nwcomponents | ' +
              'bullist numlist blockquote | alignleft aligncenter alignright | removeformat | searchreplace visualblocks code | nwimport',
            setup: editor => registerArticleTools(editor, onChangeRef, onImportRef),
            block_formats: 'Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4; Preformatted=pre',
            contextmenu: 'link image table',
            browser_spellcheck: true,

            // Keep /uploads/… and other URLs exactly as entered.
            convert_urls: false,
            relative_urls: false,
            remove_script_host: false,
            link_assume_external_targets: 'https',
            link_target_list: [
              { title: 'Same tab', value: '' },
              { title: 'New tab', value: '_blank' },
            ],

            // Images — every route goes through /api/admin/uploads (lib/uploads.ts).
            // Dropped and pasted images upload automatically, so no base64 blob ever
            // reaches the database.
            automatic_uploads: true,
            paste_data_images: true,
            images_reuse_filename: false,
            images_file_types: 'jpeg,jpg,png,gif,webp',
            image_caption: true,
            image_title: false,
            image_description: true,
            image_dimensions: false,
            object_resizing: 'img',
            images_upload_handler: (blobInfo, progress) =>
              uploadImage(blobInfo.blob(), blobInfo.filename(), progress)
                .then(r => r.url)
                .catch((err: unknown) =>
                  Promise.reject({ message: err instanceof Error ? err.message : 'Upload failed.', remove: true }),
                ),
            // "Browse" button in the Insert image dialog → native file picker → upload.
            file_picker_types: 'image',
            file_picker_callback: (callback, _value, meta) => {
              if (meta.filetype !== 'image') return
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = ACCEPTED_IMAGE_TYPES
              input.onchange = async () => {
                const file = input.files?.[0]
                if (!file) return
                try {
                  const r = await uploadImage(file, file.name)
                  callback(r.url, { alt: file.name.replace(/\.[a-z0-9]+$/i, '') })
                } catch (err) {
                  editorRef.current?.notificationManager.open({
                    text: err instanceof Error ? err.message : 'Upload failed.',
                    type: 'error',
                  })
                }
              }
              input.click()
            },
          }}
        />
      </div>
    </div>
  )
}

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

import { useEffect, useId, useRef } from 'react'
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

import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES, uploadImage, uploadFile } from '@/lib/uploadClient'
import { ARTICLE_ICONS, SNIPPETS, iconHtml, isArticleIcon } from '@/lib/articleComponents'
import { embedHtml, isPlayableVideoUrl, isSharePointUrl, parseEmbedUrl, videoHtml } from '@/lib/embeds'
import type { ImportOutcome } from '@/lib/importPipeline'

export interface ImportedMeta {
  title: string
  description: string
  /** Tags found on the page (suggestions). */
  tags: string[]
  /** The import record (lib/importDb.ts): send it with the save so the article keeps its Assets panel. */
  importId: string | null
}

/** What the form can ask the editor to do (Assets panel, Restore import). */
export interface EditorHandle {
  insertHtml(html: string): void
  replaceAll(html: string): void
  /** Swaps every occurrence of one URL for another in the content (asset replacement). */
  replaceUrl(from: string, to: string): void
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
  /** Receives a handle once the editor is ready (and null when it goes away). */
  onReady?: (handle: EditorHandle | null) => void
}

// Components menu, Media menu + Import (lib/articleComponents.ts, lib/embeds.ts,
// lib/importPipeline.ts). All only insert ordinary article HTML; the save path sanitises it
// like anything typed by hand.
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

  // Import (POST /api/admin/import, lib/importPipeline.ts): the server converts the page and
  // stores its drawings, images and videos, so they arrive in place as /uploads/… files.
  async function runImport(body: FormData) {
    editor.setProgressState(true, 0)
    let data: ImportOutcome & { error?: string }
    try {
      const res = await fetch('/api/admin/import', { method: 'POST', body })
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
      onImport.current?.({ title: data.title, description: data.description, tags: data.tags ?? [], importId: data.importId })
      editor.notificationManager.open({
        text: ['Imported. Review it before you save.', ...data.notes].join(' '),
        type: data.assets?.some(a => a.error) ? 'warning' : 'info',
        timeout: 20000,
      })
    }
    if (editor.getContent({ format: 'text' }).trim()) {
      editor.windowManager.confirm('Replace the current article content with the imported page? Undo brings it back.', ok => { if (ok) apply() })
    } else {
      apply()
    }
  }

  function pickFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,.htm,.zip,text/html,application/zip'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 100 * 1024 * 1024) {
        editor.notificationManager.open({ text: 'That file is larger than 100 MB.', type: 'error' })
        return
      }
      const body = new FormData()
      body.append('file', file, file.name)
      runImport(body)
    }
    input.click()
  }

  // ── Media: video uploads, MP4 links and YouTube / Vimeo / Scribe embeds ──────
  function openVideoDialog() {
    editor.windowManager.open({
      title: 'Insert video or embed',
      body: {
        type: 'panel',
        items: [
          { type: 'input', name: 'url', label: 'YouTube, Vimeo or Scribe link, or an MP4 on sftp.nuvho.com', placeholder: 'https://…' },
          { type: 'input', name: 'caption', label: 'Caption (optional)' },
          { type: 'htmlpanel', html: '<p style="margin:8px 0 0;font-size:13px;opacity:.75">To upload an MP4 (up to 100 MB) use <strong>Media → Upload video</strong>. SharePoint and Stream videos are not supported: they only play for people signed in to Nuvho’s Microsoft 365.</p>' },
        ],
      },
      initialData: { url: '', caption: '' },
      buttons: [
        { type: 'cancel', text: 'Cancel' },
        { type: 'submit', text: 'Insert', buttonType: 'primary' },
      ],
      onSubmit: api => {
        const { url, caption } = api.getData() as { url: string; caption: string }
        const embed = parseEmbedUrl(url)
        if (embed) {
          editor.insertContent(embedHtml(embed, caption))
        } else if (isPlayableVideoUrl(url)) {
          editor.insertContent(videoHtml(url.trim(), { caption }))
        } else {
          editor.notificationManager.open({
            text: isSharePointUrl(url)
              ? 'SharePoint and Stream videos cannot play in articles. Upload the MP4 or put it on sftp.nuvho.com/publicdownloads.'
              : 'Use a YouTube, Vimeo or Scribe link, or an https MP4 link on sftp.nuvho.com.',
            type: 'error',
          })
          return
        }
        api.close()
      },
    })
  }

  function pickVideo() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPTED_VIDEO_TYPES
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      editor.setProgressState(true, 0)
      try {
        const r = await uploadFile(file, file.name)
        editor.insertContent(videoHtml(r.url))
      } catch (err) {
        editor.notificationManager.open({ text: err instanceof Error ? err.message : 'Upload failed.', type: 'error' })
      } finally {
        editor.setProgressState(false)
      }
    }
    input.click()
  }

  editor.ui.registry.addMenuButton('nwmedia', {
    text: 'Media',
    tooltip: 'Insert a video (upload or link) or a YouTube, Vimeo or Scribe embed',
    fetch: done => done([
      { type: 'menuitem', text: 'Upload video (MP4)…', onAction: pickVideo },
      { type: 'menuitem', text: 'Video link or embed…', onAction: openVideoDialog },
    ]),
  })

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
        if (!html.trim()) return
        const body = new FormData()
        body.append('html', html)
        runImport(body)
      },
    })
  }

  editor.ui.registry.addMenuButton('nwimport', {
    text: 'Import',
    tooltip: 'Turn a standalone HTML page (or a .zip of a page and its files) into this article',
    fetch: done => done([
      { type: 'menuitem', text: 'HTML or .zip file…', onAction: pickFile },
      { type: 'menuitem', text: 'Paste HTML…', onAction: openPasteDialog },
    ]),
  })
}

function handleFor(editor: TinyMCEEditor, onChange: { current: (html: string) => void }): EditorHandle {
  const sync = () => onChange.current(editor.getContent())
  return {
    insertHtml(html) {
      editor.focus()
      editor.insertContent(html)
      sync()
    },
    replaceAll(html) {
      editor.undoManager.transact(() => editor.setContent(html))
      sync()
    },
    replaceUrl(from, to) {
      if (!from || from === to) return
      const html = editor.getContent()
      if (!html.includes(from)) return
      editor.undoManager.transact(() => editor.setContent(html.split(from).join(to)))
      sync()
    },
  }
}

export default function TinyEditor({
  value, onChange, id, placeholder = 'Write the article…', minHeight = 360, disabled = false, onImport, onReady,
}: RichTextEditorProps) {
  const toolbarId = `na-editor-toolbar-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const editorRef = useRef<TinyMCEEditor | null>(null)
  // init runs once, so the menus read the latest callbacks through refs
  const onChangeRef = useRef(onChange)
  const onImportRef = useRef(onImport)
  const onReadyRef = useRef(onReady)
  onChangeRef.current = onChange
  onImportRef.current = onImport
  onReadyRef.current = onReady
  useEffect(() => () => onReadyRef.current?.(null), [])

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
            onReadyRef.current?.(handleFor(editor, onChangeRef))
          }}
          init={{
            menubar: false,
            placeholder,
            fixed_toolbar_container: `#${toolbarId}`,
            toolbar_persist: true,
            toolbar_mode: 'wrap',
            plugins: 'advlist anchor autolink code image link lists searchreplace table visualblocks wordcount',
            toolbar:
              'undo redo | blocks | bold italic underline strikethrough | link image nwmedia table | nwcomponents | ' +
              'bullist numlist blockquote | alignleft aligncenter alignright | removeformat | searchreplace visualblocks code | nwimport',
            setup: editor => registerArticleTools(editor, onChangeRef, onImportRef),
            block_formats: 'Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4; Preformatted=pre',

            // Keep everything the importer and the Media menu write (decision 24 Nov 2026:
            // "editing an imported article in TinyMCE must not lose it"). TinyMCE's HTML5
            // schema already keeps classes, figures and images; these add the media
            // attributes it would otherwise drop. lib/sanitize.ts stays the final say on save.
            extended_valid_elements:
              'video[class|src|poster|controls|preload|playsinline|muted|loop|width|height],' +
              'iframe[class|src|title|loading|allow|allowfullscreen|referrerpolicy|width|height]',
            // TinyMCE 7+ sandboxes iframes it does not know; our three providers must play
            sandbox_iframes: true,
            sandbox_iframes_exclusions: ['youtube-nocookie.com', 'youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com', 'scribehow.com'],
            convert_unsafe_embeds: true,
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

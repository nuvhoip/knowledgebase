// Browser-side helper shared by the rich text editor (components/editor/TinyEditor.tsx)
// and the hero image field (components/ImageUploadField.tsx). Posts to /api/admin/uploads.
// Uses XHR rather than fetch so TinyMCE's progress callback can be honoured.

export interface UploadResult {
  url: string
  filename: string
  size: number
  type: string
}

/** Mirrors ALLOWED_TYPES in lib/uploads.ts — used for the <input accept> hint only. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif'

export function uploadImage(
  file: Blob,
  filename?: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/uploads')
    xhr.withCredentials = true
    xhr.upload.onprogress = e => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data: Partial<UploadResult> & { error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* non-JSON body (e.g. nginx 413 page) */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        resolve(data as UploadResult)
        return
      }
      const fallback =
        xhr.status === 413 ? 'That file is too large.' :
        xhr.status === 403 ? 'You need to be signed in with a @nuvho.com account to upload.' :
        `Upload failed (${xhr.status}).`
      reject(new Error(data.error ?? fallback))
    }
    xhr.onerror = () => reject(new Error('Network error during upload.'))
    const form = new FormData()
    form.append('file', file, filename)
    xhr.send(form)
  })
}

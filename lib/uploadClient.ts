// Browser-side helper shared by the rich text editor (components/editor/TinyEditor.tsx)
// and the hero image field (components/ImageUploadField.tsx). Posts to /api/admin/uploads.
// Uses XHR rather than fetch so TinyMCE's progress callback can be honoured.

export interface UploadResult {
  url: string
  filename: string
  size: number
  type: string
}

/** Mirrors RASTER_TYPES in lib/uploads.ts — used for the <input accept> hint only. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif'
export const ACCEPTED_VIDEO_TYPES = 'video/mp4,.mp4'
/** What the Assets panel's Replace accepts: images, SVG drawings and MP4 video. */
export const ACCEPTED_ASSET_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg,video/mp4,.mp4'

/** Raster image upload (editor image dialog, pasted images, hero field). */
export function uploadImage(
  file: Blob,
  filename?: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return uploadTo('/api/admin/uploads', file, filename, onProgress, { accept: 'image' })
}

/** MP4 video upload (editor Media menu), up to 100 MB. */
export function uploadFile(
  file: Blob,
  filename?: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  return uploadTo('/api/admin/uploads', file, filename, onProgress, { accept: 'video' })
}

/** Posts one file (field "file") plus extra fields to an upload endpoint. */
export function uploadTo(
  url: string,
  file: Blob,
  filename?: string,
  onProgress?: (percent: number) => void,
  fields: Record<string, string> = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
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
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    form.append('file', file, filename)
    xhr.send(form)
  })
}

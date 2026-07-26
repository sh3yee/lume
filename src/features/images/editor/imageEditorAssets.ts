import { convertFileSrc } from '@tauri-apps/api/core'
import {
  importImageFile,
  isTauri,
  resolveImagePath,
  storeClipboardImage,
} from '../../../types/tauri'

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export async function importEditorImageFile(
  file: File,
  documentPath: string | null,
  documentId: string,
) {
  const extension = IMAGE_MIME_EXTENSIONS[file.type]
  if (!extension) return null
  if (!isTauri()) return fileToDataUrl(file)
  return (await storeClipboardImage(
    Array.from(new Uint8Array(await file.arrayBuffer())),
    extension,
    documentPath,
    documentId,
  )).markdownPath
}

export async function importEditorImagePath(
  path: string,
  documentPath: string | null,
  documentId: string,
) {
  return (await importImageFile(path, documentPath, documentId)).markdownPath
}

export function resolveEditorImageSource(
  src: string,
  documentPath: string | null,
  documentId: string,
) {
  if (!src || REMOTE_IMAGE_PATTERN.test(src) || !isTauri()) return src
  return resolveImagePath(src, documentPath, documentId).then(convertFileSrc)
}
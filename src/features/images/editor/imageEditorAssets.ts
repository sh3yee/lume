import { isTauri } from '@/platform/tauri/client'
import { normalizeImageSourceInput } from '@/utils/imageSource'
import {
  importImageFile,
  resolveImageUrl,
  storeClipboardImage,
  transferImage,
  uploadImageFiles,
} from '@/platform/tauri/images'
import { getDocumentImageOptions } from '../model/imageSettings'

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
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
  content = '',
) {
  const extension =
    IMAGE_MIME_EXTENSIONS[file.type] ??
    file.name.match(/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i)?.[1].toLowerCase()
  if (!extension) return null
  if (!isTauri()) return fileToDataUrl(file)
  return (
    await storeClipboardImage(
      Array.from(new Uint8Array(await file.arrayBuffer())),
      extension,
      documentPath,
      documentId,
      getDocumentImageOptions(content, 'local'),
    )
  ).markdownPath
}

export async function importEditorImagePath(
  path: string,
  documentPath: string | null,
  documentId: string,
  content = '',
) {
  return (
    await importImageFile(path, documentPath, documentId, getDocumentImageOptions(content, 'local'))
  ).markdownPath
}

export const importEditorImageSource = async (
  src: string,
  documentPath: string | null,
  documentId: string,
  content = '',
) => {
  src = normalizeImageSourceInput(src)
  if (!isTauri() || /^(?:data:|blob:)/i.test(src)) return src
  if (!/^(?:https?:|\/\/)/i.test(src))
    return importEditorImagePath(src, documentPath, documentId, content)
  const options = getDocumentImageOptions(content, 'remote')
  if (options.insertAction === 'upload') {
    if (!options.uploader?.program) throw new Error('请先在偏好设置 → 图片中配置上传工具。')
    return (await uploadImageFiles([src], documentPath, documentId, options.uploader, options))[0]
      .markdownPath
  }
  if (options.insertAction === 'copy' && options.copyTo)
    return (
      await transferImage(
        src,
        `${options.copyTo.replace(/[\\/]$/, '')}/`,
        'copy',
        documentPath,
        documentId,
        options,
      )
    ).markdownPath
  return src
}

export function resolveEditorImageSource(
  src: string,
  documentPath: string | null,
  documentId: string,
  content = '',
) {
  src = normalizeImageSourceInput(src)
  if (!src || REMOTE_IMAGE_PATTERN.test(src) || !isTauri()) return src
  return resolveImageUrl(src, documentPath, documentId, getDocumentImageOptions(content))
}

import { convertFileSrc } from '@tauri-apps/api/core'
import { invokeCommand } from './client'

export interface ImageAsset {
  markdownPath: string
  localPath: string
}

export function importImageFile(path: string, documentPath: string | null, documentId: string) {
  return invokeCommand<ImageAsset>('lume_import_image_file', { path, documentPath, documentId })
}

export function storeClipboardImage(bytes: number[], extension: string, documentPath: string | null, documentId: string) {
  return invokeCommand<ImageAsset>('lume_store_clipboard_image', { bytes, extension, documentPath, documentId })
}

export function materializeStagedImages(content: string, documentPath: string, documentId: string) {
  return invokeCommand<string>('lume_materialize_staged_images', { content, documentPath, documentId })
}

export function clearStagedImages(documentId: string) {
  return invokeCommand<void>('lume_clear_staged_images', { documentId })
}

export function resolveImagePath(markdownPath: string, documentPath: string | null, documentId: string) {
  return invokeCommand<string>('lume_resolve_image_path', { markdownPath, documentPath, documentId })
}

export async function resolveImageUrl(markdownPath: string, documentPath: string | null, documentId: string) {
  return convertFileSrc(await resolveImagePath(markdownPath, documentPath, documentId))
}

import { convertFileSrc } from '@tauri-apps/api/core'
import { invokeCommand } from './client'

export interface ImageAsset {
  markdownPath: string
  localPath: string
}

export function readClipboardImagePaths() {
  return invokeCommand<string[]>('lume_read_clipboard_image_paths')
}

export interface ImageUploader {
  program: string
  args: string[]
}

export interface ImagePathOptions {
  insertAction?: 'original' | 'copy' | 'upload'
  copyTo?: string
  rootUrl?: string
  preferRelative?: boolean
  ensureDotSlash?: boolean
  escapePath?: boolean
  uploader?: ImageUploader
}

export function importImageFile(
  path: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<ImageAsset>('lume_import_image_file', {
    path,
    documentPath,
    documentId,
    options,
  })
}

export function storeClipboardImage(
  bytes: number[],
  extension: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<ImageAsset>('lume_store_clipboard_image', {
    bytes,
    extension,
    documentPath,
    documentId,
    options,
  })
}

export function materializeStagedImages(
  content: string,
  documentPath: string,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<string>('lume_materialize_staged_images', {
    content,
    documentPath,
    documentId,
    options,
  })
}

export function clearStagedImages(documentId: string, content?: string) {
  return invokeCommand<void>('lume_clear_staged_images', { documentId, content })
}

export function resolveImagePath(
  markdownPath: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<string>('lume_resolve_image_path', {
    markdownPath,
    documentPath,
    documentId,
    options,
  })
}

export async function resolveImageUrl(
  markdownPath: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return convertFileSrc(await resolveImagePath(markdownPath, documentPath, documentId, options))
}

export function transferImage(
  markdownPath: string,
  destination: string,
  mode: 'copy' | 'move',
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<ImageAsset>('lume_transfer_image', {
    markdownPath,
    destination,
    mode,
    documentPath,
    documentId,
    options,
  })
}

export function deleteImageFile(
  markdownPath: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) {
  return invokeCommand<void>('lume_delete_image_file', {
    markdownPath,
    documentPath,
    documentId,
    options,
  })
}

export function uploadImageFiles(
  markdownPaths: string[],
  documentPath: string | null,
  documentId: string,
  uploader: ImageUploader,
  options?: ImagePathOptions,
) {
  return invokeCommand<ImageAsset[]>('lume_upload_image_files', {
    markdownPaths,
    documentPath,
    documentId,
    uploader,
    options,
  })
}

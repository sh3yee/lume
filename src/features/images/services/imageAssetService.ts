import { t } from '@/app/i18n'
import { PlatformError } from '@/platform/tauri/client'
import {
  clearStagedImages,
  importImageFile,
  materializeStagedImages,
  resolveImagePath,
} from '@/platform/tauri/images'
import { getDocumentImageOptions } from '../model/imageSettings'
import { isLocalImage, rebaseImageSource } from './imageFileOperations'
import {
  collectMarkdownImageReferences,
  replaceMarkdownImageSources,
} from './markdownImageReferences'

const isStagedSource = (source: string, documentId: string) =>
  source.startsWith(`lume-staged://${documentId}/`) ||
  source.replace(/\\+/g, '/').toLowerCase().includes(`/image-staging/${documentId.toLowerCase()}/`)

const collectStagedSources = (content: string, documentId: string) => {
  if (!/image-staging|lume-staged:\/\//i.test(content)) return []
  return [...new Set(collectMarkdownImageReferences(content).map((image) => image.src))].filter(
    (source) => isStagedSource(source, documentId),
  )
}

/** 保存时落实图片复制规则，文档位置改变时按新目录处理本地引用。 */
export async function prepareDocumentImages(
  content: string,
  documentPath: string,
  documentId: string,
  originalPath: string | null,
) {
  const sources = collectStagedSources(content, documentId)
  const options = getDocumentImageOptions(content, 'local')
  const imageReplacements = new Map<string, string>()
  if (sources.length) {
    const assets = await materializeStagedImages(sources, documentPath, documentId, options)
    if (assets.length !== sources.length) throw new Error(t('暂存图片迁移结果不完整。'))
    sources.forEach((source, index) => imageReplacements.set(source, assets[index]!.markdownPath))
  }
  if (options.insertAction === 'copy') {
    const copied = new Map<string, string>()
    const originalOptions = getDocumentImageOptions(content)
    const references = new Set(collectMarkdownImageReferences(content).map((image) => image.src))
    for (const src of references) {
      if (!isLocalImage(src) || imageReplacements.has(src)) continue
      let path: string
      try {
        path = await resolveImagePath(
          src,
          originalPath ?? documentPath,
          documentId,
          originalOptions,
        )
      } catch (error) {
        // 已有坏图保留原引用，实际复制失败则中止保存，避免假报成功。
        if (
          error instanceof PlatformError &&
          (error.kind === 'NotFound' || error.kind === 'InvalidPath')
        )
          continue
        throw error
      }
      let replacement = copied.get(path)
      if (replacement === undefined) {
        replacement = (await importImageFile(path, documentPath, documentId, options)).markdownPath
        copied.set(path, replacement)
      }
      imageReplacements.set(src, replacement)
    }
  } else if (originalPath !== documentPath) {
    const original = { path: originalPath, id: documentId, content }
    const current = { path: documentPath, id: documentId, content }
    for (const { src } of collectMarkdownImageReferences(content)) {
      if (!isLocalImage(src) || imageReplacements.has(src)) continue
      // 未命名文档中的手写相对地址尚无基准，保留为相对首次保存位置的引用。
      if (!originalPath && !/^(?:[a-z]:[\\/]|[\\/]|file:)/i.test(src)) continue
      try {
        imageReplacements.set(src, await rebaseImageSource(src, original, current))
      } catch {
        // 缺失图片仍保留原引用，不能因已有坏图阻止 Markdown 保存。
      }
    }
  }
  return { content: replaceMarkdownImageSources(content, imageReplacements), imageReplacements }
}

export async function clearDocumentImageStaging(documentId: string, content?: string) {
  const sources = content === undefined ? undefined : collectStagedSources(content, documentId)
  if (sources && !sources.length) return
  await clearStagedImages(documentId, sources).catch((error) => {
    console.warn('清理图片暂存区失败:', error)
  })
}

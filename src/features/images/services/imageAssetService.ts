import { clearStagedImages, materializeStagedImages } from '@/platform/tauri/images'
import { getDocumentImageOptions } from '../model/imageSettings'
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

/** 首次保存未命名文档时迁移暂存图片，并返回可写盘的 Markdown。 */
export async function prepareDocumentImages(
  content: string,
  documentPath: string,
  documentId: string,
) {
  const sources = collectStagedSources(content, documentId)
  if (!sources.length) return content
  const assets = await materializeStagedImages(
    sources,
    documentPath,
    documentId,
    getDocumentImageOptions(content, 'local'),
  )
  if (assets.length !== sources.length) throw new Error('暂存图片迁移结果不完整。')
  return replaceMarkdownImageSources(
    content,
    new Map(sources.map((source, index) => [source, assets[index]!.markdownPath])),
  )
}

export async function clearDocumentImageStaging(documentId: string, content?: string) {
  const sources = content === undefined ? undefined : collectStagedSources(content, documentId)
  if (sources && !sources.length) return
  await clearStagedImages(documentId, sources).catch((error) => {
    console.warn('清理图片暂存区失败:', error)
  })
}

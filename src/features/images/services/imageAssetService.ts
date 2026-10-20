import { clearStagedImages, materializeStagedImages } from '@/platform/tauri/images'
import { getDocumentImageOptions } from '../model/imageSettings'

/** 首次保存未命名文档时迁移暂存图片，并返回可写盘的 Markdown。 */
export async function prepareDocumentImages(
  content: string,
  documentPath: string,
  documentId: string,
) {
  if (
    !content.includes(`lume-staged://${documentId}/`) &&
    !content.replace(/\\+/g, '/').includes(`/image-staging/${documentId}/`)
  )
    return content
  return materializeStagedImages(
    content,
    documentPath,
    documentId,
    getDocumentImageOptions(content, 'local'),
  )
}

export async function clearDocumentImageStaging(documentId: string, content?: string) {
  await clearStagedImages(documentId, content).catch((error) => {
    console.warn('清理图片暂存区失败:', error)
  })
}

import {
  clearStagedImages,
  materializeStagedImages,
} from '@/platform/tauri/images'

/** 首次保存未命名文档时迁移暂存图片，并返回可写盘的 Markdown。 */
export async function prepareDocumentImages(
  content: string,
  documentPath: string,
  documentId: string,
) {
  if (!content.includes(`lume-staged://${documentId}/`)) return content
  return materializeStagedImages(content, documentPath, documentId)
}

export async function clearDocumentImageStaging(documentId: string) {
  await clearStagedImages(documentId).catch((error) => {
    console.warn('清理图片暂存区失败:', error)
  })
}
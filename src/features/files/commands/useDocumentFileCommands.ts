/**
 * useDocumentFileCommands - 文档文件业务命令
 *
 * 组合文件 Service 与 Document Store，不在 Adapter 中修改响应式状态。
 */
import { t } from '@/app/i18n'
import { computed } from 'vue'
import { useDocument } from '../../documents/model/useDocument.ts'
import { clearDocumentImageStaging } from '@/features/images/services/imageAssetService'
import {
  readDroppedDocuments,
  saveDocumentFile,
  selectDocumentFile,
} from '../services/documentFileService'

export function useDocumentFileCommands() {
  const { activeDocument, newDocument, openDocument, completeDocumentSave } = useDocument()
  const currentFileName = computed(() => activeDocument.value?.name ?? t('未命名文档'))
  const currentFilePath = computed(() => activeDocument.value?.path ?? null)
  const isDirty = computed(() => activeDocument.value?.isDirty ?? false)

  async function openFile() {
    const file = await selectDocumentFile()
    if (file) openDocument(file.content, file.name, file.path)
  }

  async function openFilesFromPaths(paths: string[]) {
    const { files, result } = await readDroppedDocuments(paths)
    for (const file of files) openDocument(file.content, file.name, file.path)
    return result
  }

  async function saveFile(saveAs = false) {
    const document = activeDocument.value
    if (!document) return false
    const snapshot = { ...document }
    const saved = await saveDocumentFile(snapshot, saveAs)
    if (!saved) return false
    completeDocumentSave(document.id, snapshot.content, saved)
    // 并发编辑仍可能引用暂存图片，等后续完整保存成功后再清理。
    if (document.content === saved.content)
      await clearDocumentImageStaging(document.id, snapshot.content)
    return true
  }

  function saveFileAs() {
    return saveFile(true)
  }

  function newFile() {
    newDocument()
  }

  return {
    currentFileName,
    currentFilePath,
    isDirty,
    openFile,
    openFilesFromPaths,
    saveFile,
    saveFileAs,
    newFile,
  }
}

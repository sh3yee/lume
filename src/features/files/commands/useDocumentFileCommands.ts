/**
 * useDocumentFileCommands - 文档文件业务命令
 *
 * 组合文件 Service 与 Document Store，不在 Adapter 中修改响应式状态。
 */
import { computed } from 'vue'
import { useDocument } from '../../documents/model/useDocument.ts'
import { readDroppedDocuments, saveDocumentFile, selectDocumentFile } from '../services/documentFileService'

export function useDocumentFileCommands() {
  const {
    activeDocument,
    content,
    newDocument,
    openDocument,
    updateActiveDocument,
  } = useDocument()
  const currentFileName = computed(() => activeDocument.value?.name ?? '未命名文档')
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
    const saved = await saveDocumentFile(document, saveAs)
    if (!saved) return false
    if (saved.content !== content.value) content.value = saved.content
    updateActiveDocument({ name: saved.name, path: saved.path, isDirty: false })
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
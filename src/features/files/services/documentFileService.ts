import { isTauri, readDroppedMarkdownFile } from '../../../types/tauri.ts'
import { clearDocumentImageStaging, prepareDocumentImages } from '@/features/images/services/imageAssetService'
import { openBrowserDocument, saveBrowserDocument } from '../adapters/browserDocumentFileAdapter'
import { openTauriDocument, selectTauriSavePath, writeTauriDocument } from '../adapters/tauriDocumentFileAdapter'

export interface OpenFilesResult {
  opened: number
  rejected: Array<{ path: string; message: string }>
}

const MAX_DROPPED_FILES = 20

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return '读取失败'
}

export async function selectDocumentFile() {
  return isTauri() ? openTauriDocument() : openBrowserDocument()
}

export async function readDroppedDocuments(paths: string[]) {
  const files: Array<{ content: string; name: string; path: string }> = []
  const result: OpenFilesResult = { opened: 0, rejected: [] }
  const limitedPaths = paths.slice(0, MAX_DROPPED_FILES)

  if (paths.length > MAX_DROPPED_FILES) {
    result.rejected.push({ path: '', message: `单次最多打开 ${MAX_DROPPED_FILES} 个文件` })
  }
  for (const path of limitedPaths) {
    try {
      files.push(await readDroppedMarkdownFile(path))
      result.opened += 1
    } catch (error) {
      result.rejected.push({ path, message: getErrorMessage(error) })
    }
  }
  return { files, result }
}

export async function saveDocumentFile(document: {
  content: string
  id: string
  name: string
  path: string | null
}, saveAs = false) {
  if (!isTauri()) {
    saveBrowserDocument(document.content, document.name)
    return { content: document.content, name: document.name, path: document.path }
  }

  const path = await selectTauriSavePath(document.path, document.name, saveAs)
  if (!path) return null
  const content = await prepareDocumentImages(document.content, path, document.id)
  await writeTauriDocument(path, content)
  await clearDocumentImageStaging(document.id)
  return { content, name: path.split(/[\\/]/).pop() || document.name, path }
}
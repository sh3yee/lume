import { useDocument } from '@/features/documents/model/useDocument'
import {
  operateImageFile,
  rebaseImageSource,
  type ImageDocument,
  type ImageFileOperation,
} from '../services/imageFileOperations'
import { replaceMarkdownImageSources } from '../services/markdownImageReferences'

export interface ImageSourceEditor {
  replaceImageSources: (replacements: ReadonlyMap<string, string>) => void
}

/** 单图和批量操作统一更新原文档，保留操作期间继续输入的内容。 */
export const useImageFileOperations = (getEditor: () => ImageSourceEditor | null) => {
  const { activeDocument, documents, updateDocumentContent, persistDocumentSession } = useDocument()
  const execute = async (
    operation: ImageFileOperation,
    sources: string[],
    snapshot: ImageDocument,
    destination?: string,
  ) => {
    if (!sources.length) return false
    const replacement = await operateImageFile(operation, sources[0]!, snapshot, destination)
    if (replacement === null) return false
    let current = documents.value.find((document) => document.id === snapshot.id)
    if (!current) return false
    const src = await rebaseImageSource(replacement, snapshot, current)
    current = documents.value.find((document) => document.id === snapshot.id)
    if (!current) return false
    const replacements = new Map(sources.map((source) => [source, src]))
    const editor = activeDocument.value?.id === snapshot.id ? getEditor() : null
    if (editor) editor.replaceImageSources(replacements)
    else
      updateDocumentContent(snapshot.id, replaceMarkdownImageSources(current.content, replacements))
    persistDocumentSession()
    return true
  }
  return { execute }
}

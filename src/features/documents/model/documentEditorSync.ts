const documentFlushers = new Map<string, () => void>()

export const registerDocumentFlush = (documentId: string, flush: () => void) => {
  documentFlushers.set(documentId, flush)
  return () => {
    if (documentFlushers.get(documentId) === flush) documentFlushers.delete(documentId)
  }
}

/** 切换文档前提交编辑器尚未写回的内容，避免把草稿误当作空白页。 */
export const flushDocumentEdits = () => {
  for (const flush of documentFlushers.values()) flush()
}

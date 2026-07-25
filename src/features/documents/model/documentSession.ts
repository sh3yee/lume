import type { DocumentSession, OpenDocument } from './documentTypes'

const SESSION_STORAGE_KEY = 'lume-document-session'

function isOpenDocument(document: unknown): document is OpenDocument {
  if (!document || typeof document !== 'object') return false
  const value = document as Partial<OpenDocument>
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && (typeof value.path === 'string' || value.path === null)
    && typeof value.content === 'string'
    && typeof value.isDirty === 'boolean'
    && typeof value.cursor?.line === 'number'
    && typeof value.cursor?.column === 'number'
}

/** 校验从持久化存储读取的文档会话。 */
export function parseDocumentSession(value: unknown): DocumentSession | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<DocumentSession>
  if (session.version !== 1 || !Array.isArray(session.documents) || session.documents.length === 0) {
    return null
  }

  const documents = session.documents.filter(isOpenDocument)
  if (documents.length === 0) return null
  const activeDocumentId = typeof session.activeDocumentId === 'string'
    && documents.some((document) => document.id === session.activeDocumentId)
    ? session.activeDocumentId
    : documents[0].id

  return { version: 1, activeDocumentId, documents }
}

/** 从本地暂存区恢复上次关闭时的编辑会话。 */
export function restoreDocumentSession(): DocumentSession | null {
  try {
    const serializedSession = localStorage.getItem(SESSION_STORAGE_KEY)
    return serializedSession ? parseDocumentSession(JSON.parse(serializedSession)) : null
  } catch (error) {
    console.warn('恢复编辑会话失败，将使用默认文档:', error)
    return null
  }
}

/** 将编辑会话写入本地暂存区。 */
export function saveDocumentSession(session: DocumentSession) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch (error) {
    console.error('暂存编辑会话失败:', error)
  }
}
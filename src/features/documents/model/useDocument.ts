/**
 * useDocument - 文档领域入口
 *
 * 组合纯内存 Store 与会话 Repository，对现有组件提供稳定接口。
 */
import { restoreDocumentSession, saveDocumentSession } from './documentSession'
import { useDocumentStore } from './documentStore'

const documentStore = useDocumentStore()
documentStore.hydrateDocumentSession(restoreDocumentSession())

function persistDocumentSession() {
  saveDocumentSession(documentStore.getDocumentSessionSnapshot())
}

const documentModel = {
  ...documentStore,
  persistDocumentSession,
}

export function useDocument(): typeof documentModel {
  return documentModel
}

export type {
  CursorPosition,
  DocumentDropPosition,
  DocumentStats,
  OpenDocument,
} from './documentTypes'
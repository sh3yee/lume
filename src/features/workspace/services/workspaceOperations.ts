import { shallowRef } from 'vue'
import { t } from '@/app/i18n'
import { flushDocumentEdits } from '@/features/documents/model/documentEditorSync'

let pending: Promise<unknown> = Promise.resolve()
let prepareDocuments: ((root: string) => Promise<void>) | null = null
let reloadDocument: ((path: string) => Promise<void>) | null = null
let reloadWorkspaceDocuments: ((root: string) => Promise<void>) | null = null
export const versionOperationActive = shallowRef(false)

/** 保存、工作区写入与版本操作共用队列，失败不会阻断后续操作。 */
export const runWorkspaceWrite = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = pending.then(() => operation())
  pending = result.catch(() => undefined)
  return result
}

export const registerVersionDocuments = (
  prepare: (root: string) => Promise<void>,
  reload: (path: string) => Promise<void>,
  reloadWorkspace: (root: string) => Promise<void>,
) => {
  prepareDocuments = prepare
  reloadDocument = reload
  reloadWorkspaceDocuments = reloadWorkspace
  return () => {
    if (prepareDocuments === prepare) prepareDocuments = null
    if (reloadDocument === reload) reloadDocument = null
    if (reloadWorkspaceDocuments === reloadWorkspace) reloadWorkspaceDocuments = null
  }
}

export const runVersionWrite = <T>(
  root: string,
  operation: () => Promise<T>,
  saveFirst = false,
): Promise<T> =>
  runWorkspaceWrite(async () => {
    if (!prepareDocuments) throw new Error(t('版本管理的文档协调服务尚未就绪'))
    versionOperationActive.value = true
    try {
      flushDocumentEdits()
      if (saveFirst) await prepareDocuments(root)
      return await operation()
    } finally {
      versionOperationActive.value = false
    }
  })

export const reloadVersionDocument = async (path: string) => {
  if (!reloadDocument) throw new Error(t('版本管理的文档协调服务尚未就绪'))
  await reloadDocument(path)
}

export const reloadVersionWorkspace = async (root: string) => {
  if (!reloadWorkspaceDocuments) throw new Error(t('版本管理的文档协调服务尚未就绪'))
  await reloadWorkspaceDocuments(root)
}

/**
 * useWorkspaceLifecycle - 工作区监听、冲突处理与自动保存调度
 *
 * 监听只在应用壳挂载，避免侧栏隐藏时停止同步；外部内容不会覆盖 dirty 文档。
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import { isTauri } from '@/platform/tauri/client'
import { useDocument } from '@/features/documents/model/useDocument'
import { saveDocumentFile } from '@/features/files/services/documentFileService'
import { useWorkspaceCommands } from '@/features/workspace/commands/useWorkspaceCommands'
import {
  getWorkspaceErrorMessage,
  listenWorkspaceChanges,
  readWorkspaceDocument,
  startWorkspaceWatcher,
  stopWorkspaceWatcher,
} from '@/features/workspace/services/workspaceService'

export function useWorkspaceLifecycle(showMessage: (message: string) => void) {
  const {
    documents,
    updateDocumentContent,
    updateDocumentMetadata,
  } = useDocument()
  const workspace = useWorkspaceCommands()
  const persistedContents = new Map<string, string>()
  const recreateDeletedDocuments = new Set<string>()
  let unlisten: (() => void) | null = null
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  async function processExternalChanges(batch: {
    workspacePath: string
    changes: Array<{
      kind: 'created' | 'modified' | 'deleted' | 'renamed'
      path: string
      previousPath?: string
    }>
    scanDurationMs: number
  }) {
    if (batch.workspacePath !== workspace.workspacePath.value) return
    workspace.setLastScanDuration(batch.scanDurationMs)
    await workspace.loadWorkspace(batch.workspacePath)

    for (const change of batch.changes) {
      if (change.kind === 'renamed' && change.previousPath) {
        const renamedDocument = documents.value.find((item) => item.path === change.previousPath)
        if (renamedDocument) {
          updateDocumentMetadata(renamedDocument.id, {
            path: change.path,
            name: change.path.split(/[\\/]/).pop() || renamedDocument.name,
          })
        }
        continue
      }
      const document = documents.value.find((item) => item.path === change.path)
      if (!document || change.kind === 'created') continue
      if (change.kind === 'deleted') {
        workspace.setExternalConflict({
          documentId: document.id,
          fileName: document.name,
          path: change.path,
          kind: 'deleted',
        })
        continue
      }
      try {
        const diskDocument = await readWorkspaceDocument(change.path)
        if (diskDocument.content === document.content) {
          updateDocumentMetadata(document.id, { isDirty: false })
          persistedContents.set(document.id, diskDocument.content)
        } else if (document.isDirty) {
          workspace.setExternalConflict({
            documentId: document.id,
            fileName: document.name,
            path: change.path,
            kind: 'modified',
          })
        } else {
          updateDocumentContent(document.id, diskDocument.content, false)
          updateDocumentMetadata(document.id, { isDirty: false })
          persistedContents.set(document.id, diskDocument.content)
        }
      } catch (error) {
        showMessage(`读取外部修改失败：${getWorkspaceErrorMessage(error)}`)
      }
    }
  }

  async function restartWatcher(path: string | null) {
    if (!isTauri()) return
    await stopWorkspaceWatcher().catch(() => undefined)
    if (path) await startWorkspaceWatcher(path)
  }

  async function reloadConflictedDocument() {
    const conflict = workspace.externalConflict.value
    if (!conflict || conflict.kind === 'deleted') return
    try {
      const file = await readWorkspaceDocument(conflict.path)
      updateDocumentContent(conflict.documentId, file.content, false)
      updateDocumentMetadata(conflict.documentId, { isDirty: false })
      persistedContents.set(conflict.documentId, file.content)
      workspace.setExternalConflict(null)
    } catch (error) {
      showMessage(`重新加载失败：${getWorkspaceErrorMessage(error)}`)
    }
  }

  async function keepLocalChanges() {
    const conflict = workspace.externalConflict.value
    if (conflict) {
      updateDocumentMetadata(conflict.documentId, { isDirty: true })
      if (conflict.kind === 'deleted') {
        recreateDeletedDocuments.add(conflict.documentId)
      } else {
        try {
          const file = await readWorkspaceDocument(conflict.path)
          persistedContents.set(conflict.documentId, file.content)
        } catch (error) {
          showMessage(`读取外部版本失败：${getWorkspaceErrorMessage(error)}`)
          return
        }
      }
    }
    workspace.setExternalConflict(null)
  }

  async function autoSaveDirtyDocuments() {
    for (const document of documents.value) {
      if (!document.path || !document.isDirty
        || workspace.hasDocumentConflict(document.id)) continue
      try {
        if (!recreateDeletedDocuments.has(document.id)) {
          const diskDocument = await readWorkspaceDocument(document.path)
          const persistedContent = persistedContents.get(document.id)
          if (persistedContent === undefined) {
            if (diskDocument.content !== document.content) {
              workspace.setExternalConflict({
                documentId: document.id,
                fileName: document.name,
                path: document.path,
                kind: 'modified',
              })
              continue
            }
          } else if (diskDocument.content !== persistedContent
            && diskDocument.content !== document.content) {
            workspace.setExternalConflict({
              documentId: document.id,
              fileName: document.name,
              path: document.path,
              kind: 'modified',
            })
            continue
          }
        }
        const saved = await saveDocumentFile(document)
        if (!saved) continue
        updateDocumentContent(document.id, saved.content, false)
        updateDocumentMetadata(document.id, {
          name: saved.name,
          path: saved.path,
          isDirty: false,
        })
        workspace.setAutoSaveError(null)
        persistedContents.set(document.id, saved.content)
        recreateDeletedDocuments.delete(document.id)
      } catch (error) {
        const message = getWorkspaceErrorMessage(error)
        workspace.setAutoSaveError(message)
        showMessage(`自动保存失败：${message}`)
      }
    }
  }

  const stopWorkspaceWatch = watch(workspace.workspacePath, restartWatcher, { immediate: true })
  const stopPersistedContentWatch = watch(documents, (items) => {
    for (const document of items) {
      if (!document.isDirty && document.path) persistedContents.set(document.id, document.content)
    }
  }, { deep: true, immediate: true })
  const stopAutoSaveWatch = watch(documents as Ref<unknown>, () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => void autoSaveDirtyDocuments(), 1200)
  }, { deep: true })

  if (isTauri()) {
    void workspace.restoreWorkspace()
    void listenWorkspaceChanges(processExternalChanges).then((dispose) => {
      unlisten = dispose
    })
  }

  onBeforeUnmount(() => {
    stopWorkspaceWatch()
    stopAutoSaveWatch()
    stopPersistedContentWatch()
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    unlisten?.()
    if (isTauri()) void stopWorkspaceWatcher()
  })

  return {
    externalConflict: workspace.externalConflict,
    keepLocalChanges,
    reloadConflictedDocument,
  }
}
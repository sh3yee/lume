/**
 * useWorkspaceLifecycle - 工作区监听、冲突处理与自动保存调度
 *
 * 监听只在应用壳挂载，避免侧栏隐藏时停止同步；外部内容不会覆盖 dirty 文档。
 */
import { t } from '@/app/i18n'
import { onBeforeUnmount, watch } from 'vue'
import { isTauri, PlatformError } from '@/platform/tauri/client'
import { useDocument } from '@/features/documents/model/useDocument'
import { saveDocumentFile } from '@/features/files/services/documentFileService'
import { clearDocumentImageStaging } from '@/features/images/services/imageAssetService'
import { replaceMarkdownImageSources } from '@/features/images/services/markdownImageReferences'
import { useWorkspaceCommands } from '@/features/workspace/commands/useWorkspaceCommands'
import { isDocumentInDirectory, isSameDocumentPath } from '@/features/documents/model/documentPath'
import {
  registerVersionDocuments,
  runWorkspaceWrite,
  versionOperationActive,
} from '@/features/workspace/services/workspaceOperations'
import {
  getWorkspaceErrorMessage,
  listenWorkspaceChanges,
  persistExpandedPaths,
  readWorkspaceDocument,
  startWorkspaceWatcher,
  stopWorkspaceWatcher,
} from '@/features/workspace/services/workspaceService'

export function useWorkspaceLifecycle(showMessage: (message: string) => void) {
  const { documents, updateDocumentContent, updateDocumentMetadata, completeDocumentSave } =
    useDocument()
  const workspace = useWorkspaceCommands()
  const saveErrors = new Map<string, string>()
  const recreateDeletedDocuments = new Set<string>()
  let unlisten: (() => void) | null = null
  let saving = false
  let savePending = false
  let disposed = false
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  watch(
    workspace.expandedPaths,
    (paths) => {
      if (workspace.workspacePath.value) persistExpandedPaths(workspace.workspacePath.value, paths)
    },
    { flush: 'sync' },
  )

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
        const renamedDocument = documents.value.find((item) =>
          isSameDocumentPath(item.path, change.previousPath ?? null),
        )
        if (renamedDocument) {
          updateDocumentMetadata(renamedDocument.id, {
            path: change.path,
            name: change.path.split(/[\\/]/).pop() || renamedDocument.name,
          })
        }
        continue
      }
      const document = documents.value.find((item) => isSameDocumentPath(item.path, change.path))
      if (!document || change.kind === 'created') continue
      if (change.kind === 'deleted') {
        try {
          // 历史恢复可能已重新创建文件，不能用排队中的旧删除事件覆盖最新状态。
          await readWorkspaceDocument(change.path)
        } catch (error) {
          if (error instanceof PlatformError && error.kind === 'NotFound') {
            workspace.setExternalConflict({
              documentId: document.id,
              fileName: document.name,
              path: change.path,
              kind: 'deleted',
            })
          } else showMessage(t('读取外部修改失败：{0}', getWorkspaceErrorMessage(error)))
          continue
        }
      }
      try {
        const diskDocument = await readWorkspaceDocument(change.path)
        if (diskDocument.content === document.content) {
          updateDocumentMetadata(document.id, { isDirty: false })
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
        }
      } catch (error) {
        showMessage(t('读取外部修改失败：{0}', getWorkspaceErrorMessage(error)))
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
      workspace.setExternalConflict(null)
    } catch (error) {
      showMessage(t('重新加载失败：{0}', getWorkspaceErrorMessage(error)))
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
          const document = documents.value.find((item) => item.id === conflict.documentId)
          if (document) document.savedContent = file.content
        } catch (error) {
          showMessage(t('读取外部版本失败：{0}', getWorkspaceErrorMessage(error)))
          return
        }
      }
    }
    workspace.setExternalConflict(null)
    scheduleAutoSave()
  }

  const scheduleAutoSave = () => {
    if (disposed || !isTauri()) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      void runWorkspaceWrite(autoSaveDirtyDocuments)
    }, 1200)
  }

  const autoSaveDirtyDocuments = async (root?: string) => {
    if (disposed) return
    if (saving) {
      savePending = true
      return
    }
    saving = true
    try {
      for (const document of documents.value) {
        if (disposed) break
        if (root && (!document.path || !isDocumentInDirectory(document.path, root))) continue
        if (!document.path || !document.isDirty || workspace.hasDocumentConflict(document.id))
          continue
        const snapshot = { ...document }
        try {
          if (!recreateDeletedDocuments.has(document.id)) {
            const diskDocument = await readWorkspaceDocument(document.path)
            if (
              disposed ||
              !documents.value.some((item) => item.id === document.id) ||
              !document.isDirty ||
              document.path !== snapshot.path ||
              document.content !== snapshot.content ||
              document.savedContent !== snapshot.savedContent
            )
              continue
            const persistedContent = snapshot.savedContent
            if (
              (persistedContent === undefined || diskDocument.content !== persistedContent) &&
              diskDocument.content !== snapshot.content
            ) {
              workspace.setExternalConflict({
                documentId: document.id,
                fileName: document.name,
                path: document.path,
                kind: 'modified',
              })
              continue
            }
          }
          // 读取磁盘期间发生切换、关闭或编辑时，交给下一次调度保存最新快照。
          if (
            disposed ||
            !documents.value.some((item) => item.id === document.id) ||
            document.path !== snapshot.path ||
            document.content !== snapshot.content ||
            workspace.hasDocumentConflict(document.id)
          )
            continue
          const saved = await saveDocumentFile(snapshot)
          if (!saved || document.path !== snapshot.path) continue
          if (document.content !== snapshot.content && saved.imageReplacements.size)
            updateDocumentContent(
              document.id,
              replaceMarkdownImageSources(document.content, saved.imageReplacements),
            )
          completeDocumentSave(document.id, snapshot.content, saved)
          if (document.content === saved.content)
            await clearDocumentImageStaging(document.id, snapshot.content)
          saveErrors.delete(document.id)
          workspace.setAutoSaveError(saveErrors.values().next().value ?? null)
          recreateDeletedDocuments.delete(document.id)
        } catch (error) {
          const message = getWorkspaceErrorMessage(error, t('无法保存文件'))
          const previousError = saveErrors.get(document.id)
          saveErrors.set(document.id, message)
          workspace.setAutoSaveError(message)
          if (previousError !== message) showMessage(t('自动保存失败：{0}', message))
        }
      }
    } finally {
      saving = false
      if (savePending) {
        savePending = false
        scheduleAutoSave()
      }
    }
  }

  const unregisterVersionDocuments = registerVersionDocuments(
    async (root) => {
      const pending = documents.value.filter(
        (document) => document.path && isDocumentInDirectory(document.path, root),
      )
      if (pending.some((document) => workspace.hasDocumentConflict(document.id)))
        throw new Error(t('请先处理工作区文档的外部修改冲突'))
      await autoSaveDirtyDocuments(root)
      if (pending.some((document) => document.isDirty))
        throw new Error(t('工作区文档尚未保存，已停止版本操作。'))
    },
    async (path) => {
      const document = documents.value.find((item) => isSameDocumentPath(item.path, path))
      if (document) {
        const snapshot = document.content
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const content = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
        if (document.content !== snapshot) {
          workspace.setExternalConflict({
            documentId: document.id,
            fileName: document.name,
            path,
            kind: 'modified',
          })
          throw new Error(t('磁盘文件已恢复，但文档又有新修改，请处理外部修改冲突。'))
        }
        updateDocumentContent(document.id, content, false)
        updateDocumentMetadata(document.id, { isDirty: false })
      }
      if (workspace.workspacePath.value)
        await workspace.loadWorkspace(workspace.workspacePath.value)
    },
  )

  const stopVersionWatch = watch(versionOperationActive, (active) => {
    if (!active) scheduleAutoSave()
  })

  const stopWorkspaceWatch = watch(workspace.workspacePath, restartWatcher, { immediate: true })
  const stopAutoSaveWatch = watch(
    () => documents.value.map(({ id, path, content, isDirty }) => [id, path, content, isDirty]),
    () => {
      for (const id of saveErrors.keys()) {
        if (!documents.value.some((document) => document.id === id && document.isDirty)) {
          saveErrors.delete(id)
        }
      }
      workspace.setAutoSaveError(saveErrors.values().next().value ?? null)
      scheduleAutoSave()
    },
    { immediate: true },
  )

  if (isTauri()) {
    void workspace.restoreWorkspace()
    void listenWorkspaceChanges((batch) => {
      // 等恢复后的文档基准更新完成，再消费监听事件。
      void runWorkspaceWrite(() => processExternalChanges(batch))
    }).then((dispose) => {
      if (disposed) dispose()
      else unlisten = dispose
    })
  }

  onBeforeUnmount(() => {
    disposed = true
    stopWorkspaceWatch()
    stopAutoSaveWatch()
    stopVersionWatch()
    unregisterVersionDocuments()
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

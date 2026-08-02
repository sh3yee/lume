/**
 * useWorkspaceCommands - 工作区业务命令
 *
 * 组合 Workspace Store 与 Service，确保平台层不直接修改 Vue 响应式状态。
 */
import { useWorkspaceStore } from '../model/workspaceStore'
import { useDocument } from '@/features/documents/model/useDocument'
import {
  createEntry,
  deleteEntry,
  getStoredWorkspacePath,
  getWorkspaceErrorMessage,
  loadWorkspaceEntries,
  moveEntry,
  persistWorkspacePath,
  selectWorkspace as selectWorkspaceDirectory,
  renameEntry,
} from '../services/workspaceService'

export function useWorkspaceCommands() {
  const store = useWorkspaceStore()
  const { documents, updateDocumentMetadata } = useDocument()

  function replacePathPrefix(path: string, previousPath: string, nextPath: string) {
    if (path === previousPath) return nextPath
    if (!path.startsWith(`${previousPath}\\`) && !path.startsWith(`${previousPath}/`)) return path
    return `${nextPath}${path.slice(previousPath.length)}`
  }

  function syncOpenDocumentPaths(previousPath: string, nextPath: string) {
    for (const document of documents.value) {
      if (!document.path) continue
      const path = replacePathPrefix(document.path, previousPath, nextPath)
      if (path !== document.path) {
        updateDocumentMetadata(document.id, { path, name: path.split(/[\\/]/).pop() || document.name })
      }
    }
  }

  async function loadWorkspace(path: string) {
    store.setWorkspaceLoading(true)
    store.setWorkspaceError(null)
    try {
      const entries = await loadWorkspaceEntries(path)
      store.setWorkspace(path, entries)
      persistWorkspacePath(path)
      return true
    } catch (error) {
      store.setWorkspaceEntries([])
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return false
    } finally {
      store.setWorkspaceLoading(false)
    }
  }

  async function selectWorkspace() {
    try {
      const selected = await selectWorkspaceDirectory()
      if (!selected) return false
      store.resetExpandedPaths()
      return loadWorkspace(selected)
    } catch (error) {
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return false
    }
  }

  async function restoreWorkspace() {
    const path = getStoredWorkspacePath()
    if (path) await loadWorkspace(path)
  }

  async function createWorkspaceEntry(parentPath: string, name: string, isDirectory: boolean) {
    store.setWorkspaceError(null)
    try {
      const path = await createEntry(parentPath, name, isDirectory)
      if (store.workspacePath.value) await loadWorkspace(store.workspacePath.value)
      if (parentPath !== store.workspacePath.value) store.expandDirectory(parentPath)
      return path
    } catch (error) {
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return null
    }
  }

  async function renameWorkspaceEntry(path: string, newName: string) {
    const root = store.workspacePath.value
    if (!root) return null
    try {
      const nextPath = await renameEntry(root, path, newName)
      syncOpenDocumentPaths(path, nextPath)
      await loadWorkspace(root)
      return nextPath
    } catch (error) {
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return null
    }
  }

  async function moveWorkspaceEntry(path: string, targetDirectory: string) {
    const root = store.workspacePath.value
    if (!root) return null
    try {
      const nextPath = await moveEntry(root, path, targetDirectory)
      syncOpenDocumentPaths(path, nextPath)
      await loadWorkspace(root)
      store.expandDirectory(targetDirectory)
      return nextPath
    } catch (error) {
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return null
    }
  }

  async function deleteWorkspaceEntry(path: string) {
    const root = store.workspacePath.value
    if (!root) return false
    try {
      await deleteEntry(root, path)
      for (const document of documents.value) {
        if (!document.path
          || document.path !== path
          && !document.path.startsWith(`${path}\\`)
          && !document.path.startsWith(`${path}/`)) continue
        store.setExternalConflict({
          documentId: document.id,
          fileName: document.name,
          path: document.path,
          kind: 'deleted',
        })
      }
      await loadWorkspace(root)
      return true
    } catch (error) {
      store.setWorkspaceError(getWorkspaceErrorMessage(error))
      return false
    }
  }

  return {
    ...store,
    loadWorkspace,
    selectWorkspace,
    restoreWorkspace,
    createWorkspaceEntry,
    renameWorkspaceEntry,
    moveWorkspaceEntry,
    deleteWorkspaceEntry,
  }
}
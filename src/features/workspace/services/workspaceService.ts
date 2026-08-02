import { isTauri } from '@/platform/tauri/client'
import {
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  listenWorkspaceChanges,
  moveWorkspaceEntry,
  readWorkspace,
  renameWorkspaceEntry,
  selectWorkspaceDirectory,
  startWorkspaceWatcher,
  stopWorkspaceWatcher,
} from '@/platform/tauri/workspace'
import { readDroppedMarkdownFile } from '@/platform/tauri/files'

const WORKSPACE_STORAGE_KEY = 'lume-workspace-path'

export function getStoredWorkspacePath() {
  return localStorage.getItem(WORKSPACE_STORAGE_KEY)
}

export function persistWorkspacePath(path: string) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, path)
}

export function loadWorkspaceEntries(path: string) {
  return readWorkspace(path)
}

export async function selectWorkspace() {
  if (!isTauri()) throw new Error('工作区目录仅在桌面应用中可用')
  return selectWorkspaceDirectory()
}

export function createEntry(parentPath: string, name: string, isDirectory: boolean) {
  return createWorkspaceEntry(parentPath, name, isDirectory)
}

export function renameEntry(workspacePath: string, path: string, newName: string) {
  return renameWorkspaceEntry(workspacePath, path, newName)
}

export function moveEntry(workspacePath: string, path: string, targetDirectory: string) {
  return moveWorkspaceEntry(workspacePath, path, targetDirectory)
}

export function deleteEntry(workspacePath: string, path: string) {
  return deleteWorkspaceEntry(workspacePath, path)
}

export function readWorkspaceDocument(path: string) {
  return readDroppedMarkdownFile(path)
}

export { listenWorkspaceChanges, startWorkspaceWatcher, stopWorkspaceWatcher }

export function getWorkspaceErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return '无法读取工作区'
}
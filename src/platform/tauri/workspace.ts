import { invokeCommand } from './client'

export interface WorkspaceEntry {
  name: string
  path: string
  isDirectory: boolean
  children: WorkspaceEntry[]
}

export interface WorkspaceChangeBatch {
  workspacePath: string
  changes: Array<{
    kind: 'created' | 'modified' | 'deleted' | 'renamed'
    path: string
    previousPath?: string
  }>
  scanDurationMs: number
}

const WORKSPACE_CHANGE_EVENT = 'lume://workspace-change'

export function readWorkspace(path: string) {
  return invokeCommand<WorkspaceEntry[]>('lume_read_workspace', { path })
}

export function createWorkspaceEntry(parentPath: string, name: string, isDirectory: boolean) {
  return invokeCommand<string>('lume_create_workspace_entry', { parentPath, name, isDirectory })
}

export function renameWorkspaceEntry(workspacePath: string, path: string, newName: string) {
  return invokeCommand<string>('lume_rename_workspace_entry', { workspacePath, path, newName })
}

export function moveWorkspaceEntry(workspacePath: string, path: string, targetDirectory: string) {
  return invokeCommand<string>('lume_move_workspace_entry', { workspacePath, path, targetDirectory })
}

export function deleteWorkspaceEntry(workspacePath: string, path: string) {
  return invokeCommand<void>('lume_delete_workspace_entry', { workspacePath, path })
}

export function startWorkspaceWatcher(workspacePath: string) {
  return invokeCommand<void>('lume_start_workspace_watcher', { workspacePath })
}

export function stopWorkspaceWatcher() {
  return invokeCommand<void>('lume_stop_workspace_watcher')
}

export async function listenWorkspaceChanges(handler: (batch: WorkspaceChangeBatch) => void) {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<WorkspaceChangeBatch>(WORKSPACE_CHANGE_EVENT, (event) => handler(event.payload))
}

export async function selectWorkspaceDirectory() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: '打开工作区' })
  return typeof selected === 'string' ? selected : null
}

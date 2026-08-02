import { invokeCommand } from './client'

export interface WorkspaceEntry {
  name: string
  path: string
  isDirectory: boolean
  children: WorkspaceEntry[]
}

export function readWorkspace(path: string) {
  return invokeCommand<WorkspaceEntry[]>('lume_read_workspace', { path })
}

export function createWorkspaceEntry(parentPath: string, name: string, isDirectory: boolean) {
  return invokeCommand<string>('lume_create_workspace_entry', { parentPath, name, isDirectory })
}

export async function selectWorkspaceDirectory() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: '打开工作区' })
  return typeof selected === 'string' ? selected : null
}

import { shallowRef } from 'vue'
import { isDocumentInDirectory, isSameDocumentPath } from '@/features/documents/model/documentPath'
import { gitMergePaths, type GitChange } from '@/platform/tauri/git'

const conflictsByWorkspace = shallowRef<Record<string, string[]>>({})
const requests = new Map<string, number>()
let nextRequest = 0

export const isGitConflict = ({ index, working }: GitChange) =>
  ['UU', 'AU', 'UA', 'DU', 'UD', 'AA', 'DD'].includes(index + working)

export const getGitConflictWorkspace = (path: string | null) =>
  Object.keys(conflictsByWorkspace.value).find((workspace) =>
    conflictsByWorkspace.value[workspace].some((conflict) => isSameDocumentPath(path, conflict)),
  )

export const isGitConflictPath = (path: string | null) => Boolean(getGitConflictWorkspace(path))

export const containsGitConflict = (path: string) =>
  Object.values(conflictsByWorkspace.value)
    .flat()
    .some((conflict) => isSameDocumentPath(path, conflict) || isDocumentInDirectory(conflict, path))

export const refreshGitConflictPaths = async (workspace: string) => {
  const current = ++nextRequest
  requests.set(workspace, current)
  try {
    const result = await gitMergePaths(workspace)
    if (requests.get(workspace) !== current) return
    const updated = { ...conflictsByWorkspace.value }
    const root = result?.root ?? workspace
    for (const key of Object.keys(updated)) {
      if (isSameDocumentPath(key, root)) delete updated[key]
    }
    if (result?.paths.length) {
      updated[result.root] = result.paths.map((path) => `${root.replace(/[\\/]$/, '')}/${path}`)
    }
    conflictsByWorkspace.value = updated
  } finally {
    if (requests.get(workspace) === current) requests.delete(workspace)
  }
}

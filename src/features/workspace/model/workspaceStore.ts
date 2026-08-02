/**
 * workspaceStore - 工作区内存状态
 *
 * 管理当前工作区、文件树、折叠状态和加载反馈；平台调用与持久化由外部 Service 负责。
 */
import { computed, ref } from 'vue'
import type { WorkspaceEntry } from '@/platform/tauri/workspace'

const workspacePath = ref<string | null>(null)
const workspaceEntries = ref<WorkspaceEntry[]>([])
const expandedPaths = ref(new Set<string>())
const workspaceLoading = ref(false)
const workspaceError = ref<string | null>(null)
const externalConflicts = ref<Array<{
  documentId: string
  fileName: string
  path: string
  kind: 'modified' | 'deleted'
}>>([])
const externalConflict = computed(() => externalConflicts.value[0] ?? null)
const lastScanDurationMs = ref<number | null>(null)
const autoSaveError = ref<string | null>(null)

const workspaceName = computed(() =>
  workspacePath.value?.split(/[\\/]/).filter(Boolean).at(-1) ?? '工作区',
)

const visibleWorkspaceEntries = computed(() => {
  const visible: Array<WorkspaceEntry & { depth: number }> = []

  function append(entries: WorkspaceEntry[], depth: number) {
    for (const entry of entries) {
      visible.push({ ...entry, depth })
      if (entry.isDirectory && expandedPaths.value.has(entry.path)) {
        append(entry.children, depth + 1)
      }
    }
  }

  append(workspaceEntries.value, 0)
  return visible
})

function setWorkspace(path: string, entries: WorkspaceEntry[]) {
  workspacePath.value = path
  workspaceEntries.value = entries
}

function setWorkspaceEntries(entries: WorkspaceEntry[]) {
  workspaceEntries.value = entries
}

function setWorkspaceLoading(loading: boolean) {
  workspaceLoading.value = loading
}

function setWorkspaceError(message: string | null) {
  workspaceError.value = message
}

function setExternalConflict(conflict: typeof externalConflicts.value[number] | null) {
  if (!conflict) {
    externalConflicts.value.shift()
    return
  }
  const index = externalConflicts.value.findIndex((item) => item.documentId === conflict.documentId)
  if (index >= 0) externalConflicts.value[index] = conflict
  else externalConflicts.value.push(conflict)
}

function hasDocumentConflict(documentId: string) {
  return externalConflicts.value.some((conflict) => conflict.documentId === documentId)
}

function setLastScanDuration(duration: number) {
  lastScanDurationMs.value = duration
}

function setAutoSaveError(message: string | null) {
  autoSaveError.value = message
}

function resetExpandedPaths() {
  expandedPaths.value = new Set()
}

function expandDirectory(path: string) {
  expandedPaths.value = new Set(expandedPaths.value).add(path)
}

function toggleDirectory(path: string) {
  const next = new Set(expandedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedPaths.value = next
}

function containsPath(path: string) {
  if (!workspacePath.value) return false
  const root = workspacePath.value.replace(/[\\/]+$/, '').toLocaleLowerCase()
  const candidate = path.toLocaleLowerCase()
  return candidate === root
    || candidate.startsWith(`${root}\\`)
    || candidate.startsWith(`${root}/`)
}

export function useWorkspaceStore() {
  return {
    workspacePath,
    workspaceEntries,
    expandedPaths,
    workspaceLoading,
    workspaceError,
    externalConflict,
    lastScanDurationMs,
    autoSaveError,
    workspaceName,
    visibleWorkspaceEntries,
    setWorkspace,
    setWorkspaceEntries,
    setWorkspaceLoading,
    setWorkspaceError,
    setExternalConflict,
    hasDocumentConflict,
    setLastScanDuration,
    setAutoSaveError,
    resetExpandedPaths,
    expandDirectory,
    toggleDirectory,
    containsPath,
  }
}
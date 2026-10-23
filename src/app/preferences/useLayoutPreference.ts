import { reactive, toRefs, watch } from 'vue'
import { readPreference, savePreference } from './preferenceStorage'

export type ViewMode = 'wysiwyg' | 'split'

interface LayoutPreference {
  sidebarVisible: boolean
  inspectorVisible: boolean
  focusMode: boolean
  viewMode: ViewMode
  sidebarWidth: number | null
  inspectorWidth: number | null
  inspectorPanel: 'outline' | 'stats'
  openEditorsExpanded: boolean
  workspaceExpanded: boolean
}

const LAYOUT_STORAGE_KEY = 'lume-layout'

const readLayout = (): Record<string, unknown> => {
  try {
    const saved: unknown = JSON.parse(readPreference(LAYOUT_STORAGE_KEY) ?? 'null')
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const readPanelWidth = (value: unknown, min: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= 420 ? value : null

const saved = readLayout()
const layout = reactive<LayoutPreference>({
  sidebarVisible: saved.sidebarVisible === true,
  inspectorVisible: saved.inspectorVisible === true,
  focusMode: saved.focusMode === true,
  viewMode: saved.viewMode === 'split' ? 'split' : 'wysiwyg',
  sidebarWidth: readPanelWidth(saved.sidebarWidth, 200),
  inspectorWidth: readPanelWidth(saved.inspectorWidth, 180),
  inspectorPanel: saved.inspectorPanel === 'stats' ? 'stats' : 'outline',
  openEditorsExpanded: saved.openEditorsExpanded !== false,
  workspaceExpanded: saved.workspaceExpanded !== false,
})

// 同步保存操作结果，面板卸载或紧接着关闭应用时也不会丢失状态。
watch(layout, () => savePreference(LAYOUT_STORAGE_KEY, JSON.stringify(layout)), { flush: 'sync' })

const preferences = toRefs(layout)

export const useLayoutPreference = () => preferences

/**
 * useCommandPalette - 应用命令面板
 *
 * 负责命令列表、打开关闭状态和命令执行分发。
 * UI 组件只负责展示和输入，不直接持有业务状态。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface CommandPaletteItem {
  id: string
  label: string
  hint?: string
  group?: string
}

export interface CommandPaletteActions {
  newFile: () => void
  openFile: () => unknown
  saveFile: (saveAs?: boolean) => unknown
  saveFileAs: () => unknown
  toggleSidebar: () => void
  openSettings: () => void
  closeActiveDocument: () => void
}

export function useCommandPalette(actions: CommandPaletteActions) {
  const isOpen = ref(false)
  const items: CommandPaletteItem[] = [
    { id: 'new-file', label: '新建文档', hint: 'Ctrl+N' },
    { id: 'open-file', label: '打开文件', hint: 'Ctrl+O' },
    { id: 'save-file', label: '保存', hint: 'Ctrl+S' },
    { id: 'save-file-as', label: '另存为', hint: 'Ctrl+Shift+S' },
    { id: 'toggle-sidebar', label: '切换侧边栏', hint: '快捷键' },
    { id: 'toggle-settings', label: '偏好设置', hint: 'Ctrl+,' },
    { id: 'close-document', label: '关闭当前文档', hint: 'Ctrl+W' },
  ]

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function handleSelect(id: string) {
    close()

    if (id === 'new-file') actions.newFile()
    if (id === 'open-file') void actions.openFile()
    if (id === 'save-file') void actions.saveFile(false)
    if (id === 'save-file-as') void actions.saveFileAs()
    if (id === 'toggle-sidebar') actions.toggleSidebar()
    if (id === 'toggle-settings') actions.openSettings()
    if (id === 'close-document') actions.closeActiveDocument()
  }

  function handleDocumentPointerDown(event: MouseEvent) {
    if (!isOpen.value) return

    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const panel = document.querySelector('.lume-command-palette__panel')
    if (panel && panel.contains(target)) return

    const overlay = document.querySelector('.lume-command-palette')
    if (overlay && overlay.contains(target)) {
      close()
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentPointerDown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentPointerDown)
  })

  return {
    isOpen,
    items,
    open,
    close,
    handleSelect,
  }
}

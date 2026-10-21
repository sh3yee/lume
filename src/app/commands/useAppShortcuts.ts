/**
 * useAppShortcuts - 应用级快捷键
 *
 * 注册不属于具体编辑器内核的全局文件与应用命令。
 */
import { onBeforeUnmount, onMounted } from 'vue'

export function useAppShortcuts(commands: {
  closeActiveDocument: () => void
  newFile: () => void
  openFile: () => unknown
  openSettings: () => void
  saveFile: () => unknown
  saveFileAs: () => unknown
  openCommandPalette?: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
}) {
  function handlePanelShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.isComposing)
      return
    const key = event.key.toLowerCase()
    if (key !== 'e' && key !== 'o') return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat) return
    if (key === 'e') commands.toggleSidebar()
    else commands.toggleInspector()
  }

  /** 桌面编辑器常用文件快捷键。 */
  function handleShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return

    const key = event.key.toLowerCase()
    if (key === ',') {
      event.preventDefault()
      commands.openSettings()
      return
    }
    if (key === 'p') {
      event.preventDefault()
      commands.openCommandPalette?.()
      return
    }
    if (!['n', 'o', 's', 't', 'w'].includes(key)) return
    event.preventDefault()

    if (key === 'n' || key === 't') commands.newFile()
    if (key === 'o') void commands.openFile()
    if (key === 's') void (event.shiftKey ? commands.saveFileAs() : commands.saveFile())
    if (key === 'w') commands.closeActiveDocument()
  }

  onMounted(() => {
    window.addEventListener('keydown', handlePanelShortcut, true)
    window.addEventListener('keydown', handleShortcut)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handlePanelShortcut, true)
    window.removeEventListener('keydown', handleShortcut)
  })
}

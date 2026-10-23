import { onBeforeUnmount, onMounted } from 'vue'
import { getShortcutCommand } from '@/app/preferences/useShortcutPreference'
import type { ShortcutId } from './shortcuts'

interface AppShortcutCommands {
  closeActiveDocument: () => void
  newFile: () => void
  openFile: () => unknown
  openSettings: () => void
  saveFile: () => unknown
  saveFileAs: () => unknown
  openCommandPalette: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  toggleViewMode: () => void
  toggleFocusMode: () => void
  insertImage: () => unknown
}

export const useAppShortcuts = (commands: AppShortcutCommands) => {
  const actions: Record<ShortcutId, () => unknown> = {
    'new-file': commands.newFile,
    'open-file': commands.openFile,
    'save-file': commands.saveFile,
    'save-file-as': commands.saveFileAs,
    'close-document': commands.closeActiveDocument,
    'toggle-settings': commands.openSettings,
    'open-command-palette': commands.openCommandPalette,
    'toggle-sidebar': commands.toggleSidebar,
    'toggle-inspector': commands.toggleInspector,
    'toggle-view-mode': commands.toggleViewMode,
    'toggle-focus-mode': commands.toggleFocusMode,
    insertImage: commands.insertImage,
  }

  const handleShortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
    const target = event.target
    if (target instanceof Element && target.closest('[data-shortcut-recorder]')) return
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return
    const command = getShortcutCommand(event)
    if (!command) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) void actions[command]()
  }

  onMounted(() => window.addEventListener('keydown', handleShortcut, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut, true))
}

/**
 * useCommandPalette - 应用命令面板
 *
 * 负责命令列表、打开关闭状态和命令执行分发。
 * UI 组件只负责展示和输入，不直接持有业务状态。
 */
import { t } from '@/app/i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { IMAGE_COMMANDS, type ImageCommand } from '@/features/images/model/imageCommands'
import { getShortcutHint } from '@/app/preferences/useShortcutPreference'

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
  openExport: () => void
  toggleSidebar: () => void
  toggleInspector: () => void
  toggleFocusMode: () => void
  toggleViewMode: () => void
  openSettings: () => void
  closeActiveDocument: () => void
  onImageCommand?: (id: ImageCommand) => unknown
}

export function useCommandPalette(actions: CommandPaletteActions) {
  const isOpen = ref(false)
  const items = computed<CommandPaletteItem[]>(() => [
    { id: 'new-file', label: t('新建文档'), hint: getShortcutHint('new-file') },
    { id: 'open-file', label: t('打开文件'), hint: getShortcutHint('open-file') },
    { id: 'save-file', label: t('保存'), hint: getShortcutHint('save-file') },
    { id: 'save-file-as', label: t('另存为'), hint: getShortcutHint('save-file-as') },
    { id: 'export-file', label: t('导出…'), hint: getShortcutHint('export-file') },
    { id: 'toggle-sidebar', label: t('切换文件栏'), hint: getShortcutHint('toggle-sidebar') },
    { id: 'toggle-inspector', label: t('切换大纲'), hint: getShortcutHint('toggle-inspector') },
    { id: 'toggle-view-mode', label: t('切换编辑模式'), hint: getShortcutHint('toggle-view-mode') },
    {
      id: 'toggle-focus-mode',
      label: t('切换专注模式'),
      hint: getShortcutHint('toggle-focus-mode'),
    },
    { id: 'toggle-settings', label: t('偏好设置'), hint: getShortcutHint('toggle-settings') },
    { id: 'close-document', label: t('关闭当前文档'), hint: getShortcutHint('close-document') },
    ...(actions.onImageCommand
      ? IMAGE_COMMANDS.value.map((command) => ({
          id: command.id,
          label: command.label,
          hint: 'hint' in command ? command.hint : undefined,
          group: t('图片'),
        }))
      : []),
  ])

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
    if (id === 'export-file') actions.openExport()
    if (id === 'toggle-sidebar') actions.toggleSidebar()
    if (id === 'toggle-inspector') actions.toggleInspector()
    if (id === 'toggle-view-mode') actions.toggleViewMode()
    if (id === 'toggle-focus-mode') actions.toggleFocusMode()
    if (id === 'toggle-settings') actions.openSettings()
    if (id === 'close-document') actions.closeActiveDocument()
    if (IMAGE_COMMANDS.value.some((command) => command.id === id)) {
      void actions.onImageCommand?.(id as ImageCommand)
    }
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

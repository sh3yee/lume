<script setup lang="ts">
/**
 * TitleBar - 标题栏
 *
 * 显示当前文档与常用操作，并提供窗口拖拽区域。
 */
import { t } from '@/app/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Copy, FileText, Minus, MoreHorizontal, Square, X } from 'lucide-vue-next'
import { useFileOps } from '@composables/useFileOps'
import { isWindowMaximized, minimizeWindow, toggleMaximizeWindow } from '@/platform/tauri/window'
import { vLiquidGlass } from '@/ui/glass/directive'
import { getShortcutCommand, getShortcutHint } from '@/app/preferences/useShortcutPreference'

type MenuKind = 'window' | 'document'

interface MenuItem {
  id: string
  label: string
  hint?: string
  checked?: boolean
  action: () => unknown
}

const MENU_WIDTH = { window: 168, document: 248 }
const MENU_HEIGHT = { window: 106, document: 202 }

const props = defineProps<{
  sidebarVisible: boolean
  inspectorVisible: boolean
}>()
const emit = defineEmits<{
  'open-settings': []
  'close-window': []
  'open-command-palette': []
  'save-file': []
  'open-export': []
  'toggle-sidebar': []
  'toggle-inspector': []
}>()

const { currentFileName, currentFilePath, isDirty } = useFileOps()
const isMaximized = ref(false)
const moreButton = ref<HTMLButtonElement | null>(null)
const contextMenu = ref<HTMLDivElement | null>(null)
const contextMenuOpen = ref(false)
const contextMenuKind = ref<MenuKind>('window')
const contextMenuPosition = ref({ x: 0, y: 0 })

const menuItems = computed<MenuItem[]>(() => {
  if (contextMenuKind.value === 'window') {
    return [
      { id: 'minimize', label: t('最小化'), action: runMinimize },
      {
        id: 'maximize',
        label: isMaximized.value ? t('还原') : t('最大化'),
        action: handleToggleMaximize,
      },
      { id: 'close', label: t('关闭应用'), action: () => emit('close-window') },
    ]
  }
  return [
    {
      id: 'save',
      label: t('保存'),
      hint: getShortcutHint('save-file'),
      action: () => emit('save-file'),
    },
    {
      id: 'export',
      label: t('导出…'),
      hint: getShortcutHint('export-file'),
      action: () => emit('open-export'),
    },
    {
      id: 'sidebar',
      label: t('文件栏'),
      hint: getShortcutHint('toggle-sidebar'),
      checked: props.sidebarVisible,
      action: () => emit('toggle-sidebar'),
    },
    {
      id: 'inspector',
      label: t('大纲与统计'),
      hint: getShortcutHint('toggle-inspector'),
      checked: props.inspectorVisible,
      action: () => emit('toggle-inspector'),
    },
    {
      id: 'commands',
      label: t('命令面板'),
      hint: getShortcutHint('open-command-palette'),
      action: () => emit('open-command-palette'),
    },
    {
      id: 'settings',
      label: t('偏好设置'),
      hint: getShortcutHint('toggle-settings'),
      action: () => emit('open-settings'),
    },
  ]
})

const closeContextMenu = (restoreFocus = false) => {
  if (!contextMenuOpen.value) return
  contextMenuOpen.value = false
  if (restoreFocus && contextMenuKind.value === 'document') moreButton.value?.focus()
}

const openMenu = async (kind: MenuKind, x: number, y: number) => {
  const margin = 8
  contextMenuKind.value = kind
  contextMenuPosition.value = {
    x: Math.max(margin, Math.min(x, window.innerWidth - MENU_WIDTH[kind] - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - MENU_HEIGHT[kind] - margin)),
  }
  contextMenuOpen.value = true
  await nextTick()
  contextMenu.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

const handleOpenContextMenu = (event: MouseEvent) => {
  void openMenu('window', event.clientX, event.clientY)
}

const handleToggleMoreMenu = () => {
  if (contextMenuOpen.value && contextMenuKind.value === 'document') {
    closeContextMenu(true)
    return
  }
  const bounds = moreButton.value?.getBoundingClientRect()
  if (bounds) void openMenu('document', bounds.right - MENU_WIDTH.document, bounds.bottom + 6)
}

const handleMenuItemClick = (item: MenuItem) => {
  closeContextMenu(true)
  void item.action()
}

async function handleToggleMaximize() {
  isMaximized.value = await toggleMaximizeWindow()
}

function runMinimize() {
  closeContextMenu()
  void minimizeWindow()
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeContextMenu(true)
    return
  }
  if (event.key === 'Tab') {
    closeContextMenu(true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = Array.from(contextMenu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
  if (items.length === 0) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') items[0].focus()
  else if (event.key === 'End') items[items.length - 1].focus()
  else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + items.length) % items.length
    items[nextIndex].focus()
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu(true)
  if (getShortcutCommand(event)) closeContextMenu()
}

const handleDismissMenu = () => closeContextMenu()

onMounted(async () => {
  isMaximized.value = await isWindowMaximized()
  window.addEventListener('pointerdown', handleDismissMenu)
  window.addEventListener('blur', handleDismissMenu)
  window.addEventListener('resize', handleDismissMenu)
  window.addEventListener('keydown', handleWindowKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleDismissMenu)
  window.removeEventListener('blur', handleDismissMenu)
  window.removeEventListener('resize', handleDismissMenu)
  window.removeEventListener('keydown', handleWindowKeydown, true)
})
</script>

<template>
  <header class="lume-titlebar" @contextmenu.prevent="handleOpenContextMenu">
    <div v-if="$slots.documents" class="lume-titlebar__documents" @contextmenu.stop>
      <slot name="documents" />
    </div>
    <div v-else class="lume-titlebar__center" data-tauri-drag-region>
      <FileText class="lume-titlebar__document-icon" :size="16" :stroke-width="1.6" />
      <span
        class="lume-titlebar__title"
        :title="currentFilePath || currentFileName"
        data-tauri-drag-region
        >{{ currentFileName }}</span
      >
      <span
        class="lume-titlebar__save-status"
        :class="{ 'lume-titlebar__save-status--dirty': isDirty }"
        data-tauri-drag-region
      >
        <span class="lume-titlebar__status-dot"></span>
        {{ isDirty ? t('未保存') : currentFilePath ? t('已保存') : t('本地草稿') }}
      </span>
    </div>

    <div class="lume-titlebar__drag-space" data-tauri-drag-region aria-hidden="true"></div>

    <div class="lume-titlebar__tools">
      <button
        ref="moreButton"
        class="lume-titlebar__tool lume-titlebar__more"
        type="button"
        :title="t('更多操作')"
        :aria-label="t('更多操作')"
        aria-haspopup="menu"
        :aria-expanded="contextMenuOpen && contextMenuKind === 'document'"
        :aria-controls="
          contextMenuOpen && contextMenuKind === 'document' ? 'lume-titlebar-menu' : undefined
        "
        @pointerdown.stop
        @click="handleToggleMoreMenu"
        @keydown.down.prevent="handleToggleMoreMenu"
      >
        <MoreHorizontal :size="18" />
      </button>
    </div>

    <div class="lume-titlebar__right">
      <button
        class="lume-titlebar__window-control"
        type="button"
        :title="t('最小化')"
        :aria-label="t('最小化窗口')"
        @click="runMinimize"
      >
        <Minus :size="16" :stroke-width="1.5" />
      </button>

      <button
        class="lume-titlebar__window-control"
        type="button"
        :title="isMaximized ? t('还原') : t('最大化')"
        :aria-label="isMaximized ? t('还原窗口') : t('最大化窗口')"
        @click="handleToggleMaximize"
      >
        <Copy v-if="isMaximized" :size="14" :stroke-width="1.5" />
        <Square v-else :size="13" :stroke-width="1.5" />
      </button>

      <button
        class="lume-titlebar__window-control lume-titlebar__window-control--close"
        type="button"
        :title="t('关闭')"
        :aria-label="t('关闭应用')"
        @click="emit('close-window')"
      >
        <X :size="17" :stroke-width="1.5" />
      </button>
    </div>
  </header>

  <Teleport to="body">
    <div
      v-if="contextMenuOpen"
      id="lume-titlebar-menu"
      ref="contextMenu"
      v-liquid-glass
      class="lume-titlebar__context-menu"
      role="menu"
      :aria-label="contextMenuKind === 'window' ? t('窗口操作') : t('更多操作')"
      :style="{
        left: contextMenuPosition.x + 'px',
        top: contextMenuPosition.y + 'px',
        width: `${MENU_WIDTH[contextMenuKind]}px`,
      }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @pointerdown.stop
    >
      <button
        v-for="item in menuItems"
        :key="item.id"
        type="button"
        :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :aria-checked="item.checked"
        @click="handleMenuItemClick(item)"
      >
        <span class="lume-titlebar__menu-label">{{ item.label }}</span>
        <Check v-if="item.checked" :size="14" :stroke-width="1.7" />
        <span v-if="item.hint" class="lume-titlebar__menu-hint">{{ item.hint }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-titlebar {
  height: var(--lume-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-left: 14px;
  background: var(--lume-chrome-bg);
  border-bottom: 0;
  user-select: none;
  flex-shrink: 0;
}

.lume-titlebar__documents {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.lume-titlebar__drag-space {
  flex: 1 0 40px;
  align-self: stretch;
}

.lume-titlebar__center {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.lume-titlebar__document-icon {
  flex-shrink: 0;
  color: var(--lume-text-secondary);
}

.lume-titlebar__title {
  font-size: var(--lume-font-size-sm);
  font-weight: 600;
  color: var(--lume-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-titlebar__save-status {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
}

.lume-titlebar__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lume-color-success);
}

.lume-titlebar__save-status--dirty .lume-titlebar__status-dot {
  background: var(--lume-color-warning);
}

.lume-titlebar__tools {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.lume-titlebar__tool {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--lume-text-secondary);
}

.lume-titlebar__tool:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-titlebar__tool[aria-expanded='true'] {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-titlebar__tools button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}

.lume-titlebar__right {
  align-self: stretch;
  display: flex;
  align-items: center;
  margin-left: 4px;
}

.lume-titlebar__window-control {
  width: 42px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--lume-text-secondary);
  cursor: default;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-titlebar__window-control:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-titlebar__window-control--close:hover {
  background-color: #c42b1c;
  color: #ffffff;
}

.lume-titlebar__window-control:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-titlebar__context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-glass-edge);
  border-radius: var(--lume-radius-md);
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 82%, transparent);
  background-image: var(--lume-glass-reflection);
  color: var(--lume-text-primary);
  box-shadow:
    inset 0 1px 0 var(--lume-glass-rim),
    0 8px 24px var(--lume-glass-depth),
    0 2px 6px var(--lume-glass-shadow);
  user-select: none;
  backdrop-filter: var(--lume-glass-filter, blur(0px)) blur(12px);
  -webkit-backdrop-filter: var(--lume-glass-filter, blur(0px)) blur(12px);
}

@supports not (backdrop-filter: blur(1px)) {
  .lume-titlebar__context-menu {
    background: var(--lume-bg-overlay);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .lume-titlebar__context-menu {
    background: var(--lume-bg-overlay);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

.lume-titlebar__context-menu button {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--lume-font-size-sm);
  text-align: left;
  cursor: default;
}

.lume-titlebar__menu-label {
  flex: 1;
  text-align: left;
}

.lume-titlebar__menu-hint {
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
}

.lume-titlebar__context-menu button:hover,
.lume-titlebar__context-menu button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

@media (max-width: 699px) {
  .lume-titlebar__save-status {
    display: none;
  }

  .lume-titlebar {
    gap: 6px;
    padding-left: 8px;
  }

  .lume-titlebar__window-control {
    width: 34px;
  }
}
</style>

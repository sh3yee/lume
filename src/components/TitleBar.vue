<script setup lang="ts">
/**
 * TitleBar - 标题栏
 *
 * 显示应用名称和当前文件名，提供窗口拖拽区域。
 * 文件操作按钮统一放在 SideBar 资源管理器旁，避免重复。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Copy, Minus, Square, X } from 'lucide-vue-next'
import { useFileOps } from '@composables/useFileOps'
import lightLogoUrl from '@/assets/lume-logo-light.png'
import darkLogoUrl from '@/assets/lume-logo-dark.png'
import {
  isWindowMaximized,
  minimizeWindow,
  toggleMaximizeWindow,
} from '@/platform/tauri/window'

type ResolvedTheme = 'light' | 'dark' | 'glass'

const props = defineProps<{
  theme: ResolvedTheme
}>()
const { currentFileName, isDirty } = useFileOps()
const isMaximized = ref(false)
const contextMenu = ref<HTMLDivElement | null>(null)
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })

const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'close-window'): void
}>()

function closeContextMenu() {
  contextMenuOpen.value = false
}

async function openContextMenu(event: MouseEvent) {
  const menuWidth = 168
  const menuHeight = 100
  const margin = 8

  contextMenuPosition.value = {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  }
  contextMenuOpen.value = true
  await nextTick()
  contextMenu.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

async function handleToggleMaximize() {
  isMaximized.value = await toggleMaximizeWindow()
}

async function runToggleMaximize() {
  closeContextMenu()
  await handleToggleMaximize()
}

function runMinimize() {
  closeContextMenu()
  void minimizeWindow()
}

function runCloseWindow() {
  closeContextMenu()
  emit('close-window')
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeContextMenu()
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
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(async () => {
  isMaximized.value = await isWindowMaximized()
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('resize', closeContextMenu)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <header class="lume-titlebar" data-tauri-drag-region @contextmenu.prevent="openContextMenu">
    <div class="lume-titlebar__left" data-tauri-drag-region>
     <button class="lume-titlebar__logo" type="button" title="偏好设置" aria-label="打开偏好设置" data-tauri-drag-region="false"
        @click="emit('open-settings')">
        <img class="lume-titlebar__logo-image" :src="props.theme === 'dark' ? darkLogoUrl : lightLogoUrl" alt="" />
      </button>
    </div>

    <div class="lume-titlebar__center" data-tauri-drag-region>
      <span class="lume-titlebar__title">{{ currentFileName }}</span>
      <span v-if="isDirty" class="lume-titlebar__dirty">●</span>
    </div>

    <div class="lume-titlebar__right" data-tauri-drag-region="false">
      <button class="lume-titlebar__window-control" type="button" title="最小化" aria-label="最小化窗口"
        @click="runMinimize">
        <Minus :size="16" :stroke-width="1.5" />
      </button>

      <button class="lume-titlebar__window-control" type="button" :title="isMaximized ? '还原' : '最大化'"
        :aria-label="isMaximized ? '还原窗口' : '最大化窗口'" @click="handleToggleMaximize">
        <Copy v-if="isMaximized" :size="14" :stroke-width="1.5" />
        <Square v-else :size="13" :stroke-width="1.5" />
      </button>

      <button class="lume-titlebar__window-control lume-titlebar__window-control--close" type="button" title="关闭"
        aria-label="关闭应用" @click="emit('close-window')">
        <X :size="17" :stroke-width="1.5" />
      </button>
    </div>
  </header>

  <Teleport to="body">
    <div
      v-if="contextMenuOpen"
      ref="contextMenu"
      class="lume-titlebar__context-menu"
      role="menu"
      aria-label="窗口操作"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @pointerdown.stop
    >
      <button type="button" role="menuitem" @click="runMinimize">
        <span>最小化</span>
      </button>
      <button type="button" role="menuitem" @click="runToggleMaximize">
        <span>{{ isMaximized ? '还原' : '最大化' }}</span>
      </button>
      <button type="button" role="menuitem" @click="runCloseWindow">
        <span>关闭应用</span>
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
  padding-left: var(--lume-space-2);
  background-color: var(--lume-bg-surface);
  border-bottom: 1px solid var(--lume-border-subtle);
  user-select: none;
  flex-shrink: 0;
}

.lume-titlebar__left {
  display: flex;
  align-items: center;
  gap: var(--lume-space-4);
}

.lume-titlebar__logo {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  cursor: pointer;
}

.lume-titlebar__logo:hover {
  background-color: var(--lume-bg-surface-raised);
}

.lume-titlebar__logo:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}

.lume-titlebar__logo-image {
  width: 24px;
  height: 24px;
  display: block;
  border-radius: 5px;
  object-fit: cover;
  pointer-events: none;
}

.lume-titlebar__center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--lume-space-2);
}

.lume-titlebar__title {
  font-size: var(--lume-font-size-sm);
  color: var(--lume-text-secondary);
}

.lume-titlebar__dirty {
  font-size: 10px;
  color: var(--lume-accent-default);
}

.lume-titlebar__right {
  align-self: stretch;
  display: flex;
  align-items: center;
}

.lume-titlebar__window-control {
  width: 46px;
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
  transition: background-color var(--lume-transition-fast), color var(--lume-transition-fast);
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
  width: 168px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: blur(14px);
}

.lume-titlebar__context-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--lume-font-size-sm);
  text-align: left;
  cursor: default;
}

.lume-titlebar__context-menu button:hover,
.lume-titlebar__context-menu button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}
</style>
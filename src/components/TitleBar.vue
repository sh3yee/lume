<script setup lang="ts">
/**
 * TitleBar - 标题栏
 *
 * 显示应用名称和当前文件名，提供窗口拖拽区域。
 * 文件操作按钮统一放在 SideBar 资源管理器旁，避免重复。
 */
import { onMounted, ref } from 'vue'
import { Copy, Minus, Square, X } from 'lucide-vue-next'
import { useFileOps } from '@composables/useFileOps'
import lightLogoUrl from '@/assets/lume-logo-light.png'
import darkLogoUrl from '@/assets/lume-logo-dark.png'
import {
  isWindowMaximized,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../types/tauri'

type ResolvedTheme = 'light' | 'dark' | 'glass'

const props = defineProps<{
  theme: ResolvedTheme
}>()
const { currentFileName, isDirty } = useFileOps()
const isMaximized = ref(false)

const emit = defineEmits<{
  (e: 'toggle-view-mode'): void
  (e: 'close-window'): void
}>()

async function handleToggleMaximize() {
  isMaximized.value = await toggleMaximizeWindow()
}

onMounted(async () => {
  isMaximized.value = await isWindowMaximized()
})
</script>

<template>
  <header class="lume-titlebar" data-tauri-drag-region>
    <div class="lume-titlebar__left" data-tauri-drag-region>
      <button class="lume-titlebar__logo" type="button" title="切换编辑与预览布局" aria-label="切换编辑与预览布局"
        data-tauri-drag-region="false" @click="emit('toggle-view-mode')">
        <img class="lume-titlebar__logo-image" :src="props.theme === 'dark' ? darkLogoUrl : lightLogoUrl" alt="" />
      </button>
    </div>

    <div class="lume-titlebar__center" data-tauri-drag-region>
      <span class="lume-titlebar__title">{{ currentFileName }}</span>
      <span v-if="isDirty" class="lume-titlebar__dirty">●</span>
    </div>

    <div class="lume-titlebar__right" data-tauri-drag-region="false">
      <button class="lume-titlebar__window-control" type="button" title="最小化" aria-label="最小化窗口"
        @click="minimizeWindow">
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
</style>
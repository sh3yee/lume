<script setup lang="ts">
/**
 * TitleBar - 标题栏
 *
 * 显示应用名称和当前文件名，提供窗口拖拽区域。
 * 文件操作按钮统一放在 SideBar 资源管理器旁，避免重复。
 */
import { useFileOps } from '@composables/useFileOps'

const { currentFileName, isDirty } = useFileOps()
</script>

<template>
  <header class="lume-titlebar" data-tauri-drag-region>
    <div class="lume-titlebar__left" data-tauri-drag-region>
      <span class="lume-titlebar__logo">Lume</span>
    </div>

    <div class="lume-titlebar__center" data-tauri-drag-region>
      <span class="lume-titlebar__title">{{ currentFileName }}</span>
      <span v-if="isDirty" class="lume-titlebar__dirty">●</span>
    </div>

    <div class="lume-titlebar__right" data-tauri-drag-region>
      <!-- 窗口控制按钮在 Tauri 环境下由原生层接管 -->
    </div>
  </header>
</template>

<style scoped>
.lume-titlebar {
  height: var(--lume-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--lume-space-5);
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
  font-size: var(--lume-font-size-md);
  font-weight: var(--lume-font-weight-semibold);
  color: var(--lume-accent-default);
  letter-spacing: 0.5px;
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
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
}
</style>
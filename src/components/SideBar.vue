<script setup lang="ts">
/**
 * SideBar - 侧栏
 *
 * Phase 0 阶段提供占位结构，后续将承载文件树、搜索和书签面板。
 * 工具栏已具备新建文件、打开文件、保存文件、新建文件夹、刷新和折叠全部等操作按钮。
 */
import { ref } from 'vue'
import { useFileOps } from '@composables/useFileOps'

const { openFile, saveFile, newFile } = useFileOps()

// 操作按钮事件（后续接入 Tauri 命令时替换为实际逻辑）
const emit = defineEmits<{
  (e: 'new-folder'): void
  (e: 'refresh'): void
  (e: 'collapse-all'): void
}>()

const isCollapsed = ref(false)

function handleNewFile() {
  newFile()
}

function handleNewFolder() {
  emit('new-folder')
}

function handleRefresh() {
  emit('refresh')
}

function handleCollapseAll() {
  isCollapsed.value = !isCollapsed.value
  emit('collapse-all')
}
</script>

<template>
  <aside class="lume-sidebar">
    <div class="lume-sidebar__header">
      <span class="lume-sidebar__label">资源管理器</span>

      <div class="lume-sidebar__actions">
        <button class="lume-sidebar__action" title="新建文件" aria-label="新建文件" @click="handleNewFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5L9 1z" stroke="currentColor"
              stroke-width="1.2" stroke-linejoin="round" />
            <path d="M9 1v4h4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
            <path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>

        <button class="lume-sidebar__action" title="打开文件" aria-label="打开文件" @click="openFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
              stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
            <path d="M6 8.5h4M8 6.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>

        <button class="lume-sidebar__action" title="保存文件" aria-label="保存文件" @click="saveFile">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 1h8l2 2v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" stroke="currentColor"
              stroke-width="1.2" stroke-linejoin="round" />
            <path d="M5 1v4h5V1" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
            <rect x="5" y="9" width="6" height="4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
          </svg>
        </button>

        <button class="lume-sidebar__action" :class="{ 'lume-sidebar__action--active': isCollapsed }" title="折叠全部"
          aria-label="折叠全部" @click="handleCollapseAll">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 6l-3 2 3 2M5 10l-3-2 3-2M11 6l3 2-3 2M11 10l3-2-3-2" stroke="currentColor" stroke-width="1.2"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="lume-sidebar__content">
      <div class="lume-sidebar__placeholder">
        <p>尚未打开工作区</p>
        <p class="lume-sidebar__hint">打开一个文件夹以浏览文档</p>
      </div>
    </div>

    <div class="lume-sidebar__footer">
      <span class="lume-sidebar__status">就绪</span>
    </div>
  </aside>
</template>

<style scoped>
.lume-sidebar {
  width: var(--lume-sidebar-width);
  display: flex;
  flex-direction: column;
  background-color: var(--lume-bg-surface);
  border-right: 1px solid var(--lume-border-subtle);
  flex-shrink: 0;
  overflow: hidden;
}

.lume-sidebar__header {
  height: var(--lume-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--lume-space-3) 0 var(--lume-space-5);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__label {
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--lume-text-tertiary);
}

.lume-sidebar__actions {
  display: flex;
  align-items: center;
  gap: var(--lume-space-1);
}

.lume-sidebar__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--lume-radius-sm);
  background-color: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
  transition: background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-sidebar__action:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__action:active {
  background-color: var(--lume-border-subtle);
}

.lume-sidebar__action--active {
  background-color: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
}

.lume-sidebar__action--active:hover {
  background-color: var(--lume-accent-subtle);
  color: var(--lume-accent-hover);
}

.lume-sidebar__action:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 1px;
}

.lume-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--lume-space-5);
}

.lume-sidebar__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--lume-space-8) var(--lume-space-4);
  color: var(--lume-text-tertiary);
}

.lume-sidebar__hint {
  font-size: var(--lume-font-size-xs);
  margin-top: var(--lume-space-2);
  color: var(--lume-text-tertiary);
}

.lume-sidebar__footer {
  height: var(--lume-statusbar-height);
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-5);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__status {
  font-size: var(--lume-font-size-xs);
  color: var(--lume-text-tertiary);
}
</style>
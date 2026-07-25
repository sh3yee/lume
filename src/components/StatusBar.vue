<script setup lang="ts">
/**
 * StatusBar - 状态栏
 *
 * 显示字数、字符数、阅读时长、光标位置和编码等信息。
 * 通过 useDocument composable 获取实时统计。
 */
import { PanelLeft } from 'lucide-vue-next'
import { useDocument } from '@composables/useDocument'

const props = defineProps<{
  sidebarVisible: boolean
}>()

const { cursor, stats } = useDocument()

const emit = defineEmits<{
  'toggle-sidebar': []
}>()
</script>

<template>
  <footer class="lume-statusbar">
    <div class="lume-statusbar__left">
     <button class="lume-statusbar__sidebar-trigger"
        :class="{ 'lume-statusbar__sidebar-trigger--active': props.sidebarVisible }" type="button"
        :title="props.sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'" :aria-label="props.sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'"
        :aria-pressed="props.sidebarVisible" @click="emit('toggle-sidebar')">
        <PanelLeft :size="15" :stroke-width="1.7" />
      </button>
      <span class="lume-statusbar__item">就绪</span>
    </div>

    <div class="lume-statusbar__right">
      <span class="lume-statusbar__item">行 {{ cursor.line }}, 列 {{ cursor.column }}</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">{{ stats.words }} 字</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">{{ stats.chars }} 字符</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">约 {{ stats.readingTime }} 分钟</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">UTF-8</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">Markdown</span>
    </div>
  </footer>
</template>

<style scoped>
.lume-statusbar {
  height: var(--lume-statusbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--lume-space-5) 0 var(--lume-space-2);
  background-color: var(--lume-bg-surface);
  border-top: 1px solid var(--lume-border-subtle);
  font-size: var(--lume-font-size-xs);
  color: var(--lume-text-tertiary);
  user-select: none;
  flex-shrink: 0;
}

.lume-statusbar__left,
.lume-statusbar__right {
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
}

.lume-statusbar__item {
  white-space: nowrap;
}

.lume-statusbar__sidebar-trigger {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
  transition: background-color var(--lume-transition-fast), color var(--lume-transition-fast);
}

.lume-statusbar__sidebar-trigger:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-statusbar__sidebar-trigger--active {
  background-color: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
}

.lume-statusbar__sidebar-trigger:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 0;
}

.lume-statusbar__separator {
  width: 1px;
  height: 12px;
  background-color: var(--lume-border-subtle);
}
</style>
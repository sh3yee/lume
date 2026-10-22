<script setup lang="ts">
/**
 * StatusBar - 状态栏
 *
 * 显示字数、字符数、阅读时长、光标位置和编码等信息。
 * 通过 useDocument composable 获取实时统计。
 */
import { t } from '@/app/i18n'
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
  <footer class="lume-statusbar" @contextmenu.prevent>
    <div class="lume-statusbar__left">
      <button
        class="lume-statusbar__sidebar-trigger"
        :class="{ 'lume-statusbar__sidebar-trigger--active': props.sidebarVisible }"
        type="button"
        :title="props.sidebarVisible ? t('隐藏侧边栏') : t('显示侧边栏')"
        :aria-label="props.sidebarVisible ? t('隐藏侧边栏') : t('显示侧边栏')"
        :aria-pressed="props.sidebarVisible"
        @click="emit('toggle-sidebar')"
      >
        <PanelLeft :size="15" :stroke-width="1.7" />
      </button>
      <span class="lume-statusbar__item">Markdown</span>
      <span class="lume-statusbar__encoding">UTF-8</span>
    </div>

    <div class="lume-statusbar__right">
      <span class="lume-statusbar__item lume-statusbar__position">{{
        t('行 {0}, 列 {1}', cursor.line, cursor.column)
      }}</span>
      <span class="lume-statusbar__separator lume-statusbar__position"></span>
      <span class="lume-statusbar__item">{{ t('{0} 字', stats.words.toLocaleString()) }}</span>
      <span class="lume-statusbar__separator"></span>
      <span class="lume-statusbar__item">{{ t('{0} 字符', stats.chars.toLocaleString()) }}</span>
      <span class="lume-statusbar__separator lume-statusbar__reading-time"></span>
      <span class="lume-statusbar__item lume-statusbar__reading-time">{{
        t('约 {0} 分钟阅读', stats.readingTime)
      }}</span>
    </div>
  </footer>
</template>

<style scoped>
.lume-statusbar {
  height: var(--lume-statusbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 10px;
  background: var(--lume-chrome-bg);
  border-top: 1px solid var(--lume-border-subtle);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-tight);
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

.lume-statusbar__right {
  font-variant-numeric: tabular-nums;
}

.lume-statusbar__encoding {
  margin-left: 6px;
  color: var(--lume-text-tertiary);
}

.lume-statusbar__item {
  white-space: nowrap;
}

.lume-statusbar__sidebar-trigger {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
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
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: var(--lume-border-strong);
}

@media (max-width: 699px) {
  .lume-statusbar__reading-time,
  .lume-statusbar__encoding {
    display: none;
  }
}

@media (max-width: 479px) {
  .lume-statusbar__position {
    display: none;
  }
}
</style>

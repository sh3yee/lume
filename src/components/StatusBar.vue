<script setup lang="ts">
/**
 * StatusBar - 状态栏
 *
 * 显示字数、字符数、阅读时长、光标位置和编码等信息。
 * 通过 useDocument composable 获取实时统计。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FilePlus2, FolderOpen, Menu, Settings } from 'lucide-vue-next'
import { useDocument } from '@composables/useDocument'

const { cursor, stats } = useDocument()
const menuRef = ref<HTMLDivElement | null>(null)
const menuOpen = ref(false)

const emit = defineEmits<{
  (e: 'new-file'): void
  (e: 'open-file'): void
  (e: 'open-settings'): void
}>()

function runMenuAction(action: 'new-file' | 'open-file' | 'open-settings') {
  menuOpen.value = false
  emit(action)
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!menuRef.value?.contains(event.target as Node)) menuOpen.value = false
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <footer class="lume-statusbar">
    <div class="lume-statusbar__left">
      <div ref="menuRef" class="lume-statusbar__menu-wrap">
        <button class="lume-statusbar__menu-trigger" :class="{ 'lume-statusbar__menu-trigger--active': menuOpen }"
          type="button" title="主菜单" aria-label="打开主菜单" aria-haspopup="menu" :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen">
          <Menu :size="15" :stroke-width="1.7" />
        </button>

        <Transition name="lume-menu">
          <div v-if="menuOpen" class="lume-statusbar__menu" role="menu">
            <div class="lume-statusbar__menu-heading">
              <span class="lume-statusbar__menu-brand">Lume</span>
              <span>Markdown Editor</span>
            </div>

            <button class="lume-statusbar__menu-item" type="button" role="menuitem" @click="runMenuAction('new-file')">
              <FilePlus2 :size="16" :stroke-width="1.6" />
              <span>新建文档</span>
              <kbd>Ctrl T</kbd>
            </button>
            <button class="lume-statusbar__menu-item" type="button" role="menuitem" @click="runMenuAction('open-file')">
              <FolderOpen :size="16" :stroke-width="1.6" />
              <span>打开文件…</span>
              <kbd>Ctrl O</kbd>
            </button>

            <div class="lume-statusbar__menu-separator"></div>

            <button class="lume-statusbar__menu-item" type="button" role="menuitem"
              @click="runMenuAction('open-settings')">
              <Settings :size="16" :stroke-width="1.6" />
              <span>偏好设置</span>
              <kbd>Ctrl ,</kbd>
            </button>
          </div>
        </Transition>
      </div>
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
  padding: 0 var(--lume-space-5);
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

.lume-statusbar__menu-wrap {
  position: relative;
  display: flex;
}

.lume-statusbar__menu-trigger {
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

.lume-statusbar__menu-trigger:hover,
.lume-statusbar__menu-trigger--active {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-statusbar__menu-trigger:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 0;
}
.lume-statusbar__menu {
  position: absolute;
  bottom: calc(100% + var(--lume-space-3));
  left: 0;
  z-index: var(--lume-z-overlay);
  width: 238px;
  padding: var(--lume-space-3);
  border: 1px solid color-mix(in srgb, var(--lume-border-default) 75%, transparent);
  border-radius: var(--lume-radius-lg);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-lg);
  backdrop-filter: blur(14px);
}

.lume-statusbar__menu-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: var(--lume-space-3) var(--lume-space-3) var(--lume-space-4);
  color: var(--lume-text-tertiary);
  font-size: 10px;
  letter-spacing: 0.4px;
}

.lume-statusbar__menu-brand {
  color: var(--lume-accent-default);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: 0.5px;
}

.lume-statusbar__menu-item {
  width: 100%;
  height: 36px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--lume-space-3);
  padding: 0 var(--lume-space-3);
  border-radius: var(--lume-radius-md);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  text-align: left;
}

.lume-statusbar__menu-item:hover {
  background-color: var(--lume-accent-subtle);
  color: var(--lume-text-primary);
}

.lume-statusbar__menu-item:hover>svg {
  color: var(--lume-accent-default);
}

.lume-statusbar__menu-item kbd {
  color: var(--lume-text-tertiary);
  font-family: var(--lume-font-sans);
  font-size: 10px;
}

.lume-statusbar__menu-separator {
  height: 1px;
  margin: var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}

.lume-menu-enter-active,
.lume-menu-leave-active {
  transition: opacity var(--lume-transition-fast), transform var(--lume-transition-fast);
  transform-origin: bottom left;
}

.lume-menu-enter-from,
.lume-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
.lume-statusbar__separator {
  width: 1px;
  height: 12px;
  background-color: var(--lume-border-subtle);
}
</style>
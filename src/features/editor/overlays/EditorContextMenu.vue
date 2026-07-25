<script setup lang="ts">
/** 编辑器右键菜单：管理菜单结构、键盘导航与焦点，不依赖编辑器内核。 */
import { ref } from 'vue'

defineProps<{
  canConvertToParagraph: boolean
  hasSelection: boolean
  inCodeBlock: boolean
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  clearFormatting: []
  close: []
  convertToParagraph: []
  copy: []
  cut: []
  insertBlockquote: []
  insertCodeBlock: []
  insertHeading: [level: number]
  insertHorizontalRule: []
  insertImage: []
  insertList: [ordered: boolean]
  insertTable: []
  paste: []
  redo: []
  selectAll: []
  toggleBold: []
  toggleInlineCode: []
  toggleItalic: []
  undo: []
}>()

const menu = ref<HTMLDivElement | null>(null)

function getItems() {
  return Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
}

function focusFirstItem() {
  getItems()[0]?.focus()
}

function getBounds() {
  return menu.value?.getBoundingClientRect() ?? null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = getItems()
  if (items.length === 0) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') items[0].focus()
  else if (event.key === 'End') items[items.length - 1].focus()
  else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    items[(currentIndex + direction + items.length) % items.length].focus()
  }
}

defineExpose({ focusFirstItem, getBounds })
</script>

<template>
  <div
    ref="menu"
    class="lume-editor-context-menu"
    role="menu"
    aria-label="编辑区操作"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @contextmenu.prevent
    @keydown="handleKeydown"
    @pointerdown.stop
  >
    <template v-if="hasSelection">
      <button type="button" role="menuitem" @click="emit('copy')">复制</button>
      <button type="button" role="menuitem" @click="emit('cut')">剪切</button>
      <div class="lume-editor-context-menu__separator" role="separator"></div>
      <template v-if="!inCodeBlock">
        <button type="button" role="menuitem" @click="emit('toggleBold')">加粗</button>
        <button type="button" role="menuitem" @click="emit('toggleItalic')">斜体</button>
        <button type="button" role="menuitem" @click="emit('toggleInlineCode')">行内代码</button>
        <button type="button" role="menuitem" @click="emit('clearFormatting')">清除行内格式</button>
      </template>
      <div class="lume-editor-context-menu__separator" role="separator"></div>
    </template>

    <template v-if="canConvertToParagraph">
      <button type="button" role="menuitem" @click="emit('convertToParagraph')">转为正文</button>
      <div class="lume-editor-context-menu__separator" role="separator"></div>
    </template>

    <button type="button" role="menuitem" @click="emit('paste')">粘贴</button>
    <div class="lume-editor-context-menu__submenu" role="none">
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded="false">
        <span>插入</span>
        <span class="lume-editor-context-menu__submenu-arrow">›</span>
      </button>
      <div class="lume-editor-context-menu__submenu-menu" role="menu" aria-label="插入">
        <button type="button" role="menuitem" @click="emit('insertHorizontalRule')">分割线</button>
        <button type="button" role="menuitem" @click="emit('insertCodeBlock')">代码块</button>
        <button type="button" role="menuitem" @click="emit('insertTable')">表格</button>
        <button type="button" role="menuitem" @click="emit('insertBlockquote')">引用</button>
        <button type="button" role="menuitem" @click="emit('insertList', false)">无序列表</button>
        <button type="button" role="menuitem" @click="emit('insertList', true)">有序列表</button>
        <button type="button" role="menuitem" @click="emit('insertHeading', 1)">一级标题</button>
        <button type="button" role="menuitem" @click="emit('insertHeading', 2)">二级标题</button>
        <button type="button" role="menuitem" @click="emit('insertHeading', 3)">三级标题</button>
        <button type="button" role="menuitem" @click="emit('insertImage')">图片</button>
      </div>
    </div>
    <div class="lume-editor-context-menu__separator" role="separator"></div>
    <button type="button" role="menuitem" @click="emit('undo')">撤销</button>
    <button type="button" role="menuitem" @click="emit('redo')">重做</button>
    <button type="button" role="menuitem" @click="emit('selectAll')">全选</button>
  </div>
</template>

<style scoped>
.lume-editor-context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  width: 192px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: blur(14px);
}

.lume-editor-context-menu button {
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

.lume-editor-context-menu button:hover,
.lume-editor-context-menu button:focus-visible,
.lume-editor-context-menu__submenu:hover > button,
.lume-editor-context-menu__submenu:focus-within > button {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-editor-context-menu__submenu {
  position: relative;
}

.lume-editor-context-menu__submenu::after {
  content: '';
  position: absolute;
  top: -8px;
  right: -8px;
  width: 10px;
  height: calc(100% + 16px);
}

.lume-editor-context-menu__submenu > button {
  justify-content: space-between;
}

.lume-editor-context-menu__submenu-arrow {
  color: var(--lume-text-tertiary);
  font-size: 16px;
  line-height: 1;
}

.lume-editor-context-menu__submenu-menu {
  position: absolute;
  bottom: -8px;
  left: calc(100% + 2px);
  width: 156px;
  display: none;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  backdrop-filter: blur(14px);
}

.lume-editor-context-menu__submenu:hover .lume-editor-context-menu__submenu-menu,
.lume-editor-context-menu__submenu:focus-within .lume-editor-context-menu__submenu-menu {
  display: block;
}

.lume-editor-context-menu__separator {
  height: 1px;
  margin: var(--lume-space-2) var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}
</style>
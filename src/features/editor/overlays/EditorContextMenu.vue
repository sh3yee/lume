<script setup lang="ts">
import { t } from '@/app/i18n'
import { vLiquidGlass } from '@/ui/glass/directive'
import { computed, nextTick, ref } from 'vue'
import type { ContextMenuItem } from './contextMenuTypes'
import { constrainOverlayPosition } from './overlayPosition'

const props = defineProps<{
  groups: ContextMenuItem[][]
  position: { x: number; y: number }
  overlayId?: string
}>()
const emit = defineEmits<{ close: []; action: [id: string] }>()
const menu = ref<HTMLDivElement | null>(null)
const submenu = ref<HTMLDivElement | null>(null)
const expanded = ref<ContextMenuItem | null>(null)
const submenuPosition = ref({ x: 0, y: 0 })
const submenuItems = computed(() => expanded.value?.children ?? [])
let trigger: HTMLButtonElement | null = null

const getItems = (root = menu.value) =>
  Array.from(root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
const focusFirstItem = () => getItems()[0]?.focus()
const getBounds = () => menu.value?.getBoundingClientRect() ?? null
const closeSubmenu = () => {
  expanded.value = null
}
const openSubmenu = async (item: ContextMenuItem, element: HTMLButtonElement, focus = false) => {
  if (!item.children) {
    closeSubmenu()
    return
  }
  trigger = element
  expanded.value = item
  await nextTick()
  const bounds = element.getBoundingClientRect()
  const size = submenu.value?.getBoundingClientRect()
  if (!size) return
  const x =
    bounds.right + 4 + size.width <= window.innerWidth - 8
      ? bounds.right + 4
      : bounds.left - size.width - 4
  submenuPosition.value = constrainOverlayPosition({ x, y: bounds.top }, size)
  await nextTick()
  if (focus) getItems(submenu.value)[0]?.focus()
}
const handleActivate = (item: ContextMenuItem, event: MouseEvent) => {
  if (item.children) void openSubmenu(item, event.currentTarget as HTMLButtonElement, true)
  else emit('action', item.id)
}
const handleKeydown = (event: KeyboardEvent, inSubmenu = false) => {
  if (event.key === 'Tab') {
    emit('close')
    return
  }
  if (event.key === 'Escape' || (inSubmenu && event.key === 'ArrowLeft')) {
    event.preventDefault()
    event.stopPropagation()
    if (expanded.value) {
      closeSubmenu()
      trigger?.focus()
    } else emit('close')
    return
  }
  const items = getItems(inSubmenu ? submenu.value : menu.value)
  const current = document.activeElement as HTMLButtonElement
  if (!inSubmenu && event.key === 'ArrowRight') {
    const item = props.groups.flat().find((entry) => entry.id === current.dataset.action)
    if (item?.children) {
      event.preventDefault()
      void openSubmenu(item, current, true)
    }
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
  event.preventDefault()
  if (!inSubmenu) closeSubmenu()
  const index = items.indexOf(current)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
defineExpose({ focusFirstItem, getBounds })
</script>

<template>
  <div
    ref="menu"
    v-liquid-glass
    class="lume-editor-context-menu"
    role="menu"
    :aria-label="t('编辑区操作')"
    :data-editor-overlay="overlayId"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @contextmenu.prevent
    @keydown="handleKeydown($event)"
    @pointerdown.stop
  >
    <template v-for="(group, index) in groups" :key="index">
      <div v-if="index" class="lume-editor-context-menu__separator" role="separator"></div>
      <button
        v-for="item in group"
        :key="item.id"
        type="button"
        :role="item.active === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :data-action="item.id"
        :disabled="item.disabled"
        :aria-checked="item.active"
        :title="item.reason"
        :aria-label="item.reason ? `${item.label}，${item.reason}` : item.label"
        :aria-haspopup="item.children ? 'menu' : undefined"
        :aria-expanded="item.children ? expanded?.id === item.id : undefined"
        @mouseenter="openSubmenu(item, $event.currentTarget as HTMLButtonElement)"
        @click="handleActivate(item, $event)"
      >
        <span>{{ item.label }}</span
        ><span v-if="item.active" aria-hidden="true">{{ item.active === 'mixed' ? '−' : '✓' }}</span
        ><span v-if="item.children" aria-hidden="true">›</span>
      </button>
    </template>
  </div>
  <Teleport to="body">
    <div
      v-if="expanded"
      ref="submenu"
      v-liquid-glass
      class="lume-editor-context-menu lume-editor-context-menu--submenu"
      role="menu"
      :aria-label="expanded.label"
      :data-editor-overlay="overlayId"
      :style="{ left: `${submenuPosition.x}px`, top: `${submenuPosition.y}px` }"
      @contextmenu.prevent
      @pointerdown.stop
      @keydown="handleKeydown($event, true)"
    >
      <button
        v-for="item in submenuItems"
        :key="item.id"
        type="button"
        :role="item.active === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :disabled="item.disabled"
        :aria-checked="item.active"
        :title="item.reason"
        :aria-label="item.reason ? `${item.label}，${item.reason}` : item.label"
        @click="emit('action', item.id)"
      >
        <span>{{ item.label }}</span
        ><span v-if="item.active" aria-hidden="true">{{
          item.active === 'mixed' ? '−' : '✓'
        }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-editor-context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  box-sizing: border-box;
  width: 216px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-glass-edge);
  border-radius: var(--lume-radius-md);
  background-color: color-mix(in srgb, var(--lume-glass-overlay) 85%, transparent);
  background-image: var(--lume-glass-reflection);
  color: var(--lume-text-secondary);
  box-shadow:
    inset 0 1px 0 var(--lume-glass-rim),
    var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: var(--lume-glass-filter, blur(4px)) blur(1px);
  -webkit-backdrop-filter: var(--lume-glass-filter, blur(4px)) blur(1px);
}
@supports not (backdrop-filter: blur(1px)) {
  .lume-editor-context-menu {
    background: var(--lume-bg-overlay);
  }
}
.lume-editor-context-menu--submenu {
  z-index: calc(var(--lume-z-tooltip) + 1);
}
.lume-editor-context-menu button {
  width: 100%;
  min-height: 28px;
  display: flex;
  justify-content: space-between;
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
.lume-editor-context-menu button:disabled {
  opacity: 0.4;
}
.lume-editor-context-menu button:not(:disabled):hover,
.lume-editor-context-menu button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}
.lume-editor-context-menu__separator {
  height: 1px;
  margin: var(--lume-space-2) var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}
</style>

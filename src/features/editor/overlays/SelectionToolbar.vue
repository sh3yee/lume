<script setup lang="ts">
import { t } from '@/app/i18n'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Copy,
  Check,
  Scissors,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  MoreHorizontal,
  ExternalLink,
  Rows3,
  Columns3,
  IndentIncrease,
  IndentDecrease,
  CheckSquare,
  FileCode,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
} from 'lucide-vue-next'
import type { ContextMenuItem } from './contextMenuTypes'
import type { SelectionToolbarModel } from '../wysiwyg/selectionToolbarItems'
import EditorContextMenu from './EditorContextMenu.vue'
import { constrainOverlayPosition } from './overlayPosition'
import './floating-toolbar.css'

const icons: Record<string, typeof Bold> = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  inlineCode: Code,
  setLink: Link,
  copy: Copy,
  cut: Scissors,
  editImage: Pencil,
  editMath: Pencil,
  copyMath: Copy,
  editLink: Pencil,
  openLink: ExternalLink,
  copyLink: Link,
  imageLeft: AlignLeft,
  imageCenter: AlignCenter,
  imageRight: AlignRight,
  resetImageSize: RotateCcw,
  rowAfter: Rows3,
  colAfter: Columns3,
  alignColumnLeft: AlignLeft,
  alignColumnCenter: AlignCenter,
  alignColumnRight: AlignRight,
  indentList: IndentIncrease,
  outdentList: IndentDecrease,
  toggleTask: CheckSquare,
  copySource: Code,
  editSource: FileCode,
  gotoFootnote: ExternalLink,
  paragraphBefore: ArrowUp,
  paragraphAfter: ArrowDown,
  copyCode: Copy,
  editCodeLanguage: Code,
  deleteNode: Trash2,
  deleteTable: Trash2,
  tableAlign: AlignLeft,
  tableInsert: Plus,
  tableDelete: Trash2,
}
const props = defineProps<{
  model: SelectionToolbarModel
  position: { x: number; y: number }
  overlayId: string
  revision: number
}>()
const emit = defineEmits<{ action: [id: string]; dismiss: [] }>()
const root = ref<HTMLDivElement | null>(null)
const menu = ref<{ focusFirstItem: () => void; getBounds: () => DOMRect | null } | null>(null)
const menuGroups = ref<ContextMenuItem[][] | null>(null)
const expandedId = ref<string | null>(null)
const menuPosition = ref({ x: 0, y: 0 })
const focusedIndex = ref(0)
const copied = ref(false)
const hasMore = computed(() => props.model.more.length > 0)
const tabstopIndex = computed(() => {
  if (focusedIndex.value === props.model.items.length && hasMore.value) return focusedIndex.value
  if (props.model.items[focusedIndex.value] && !props.model.items[focusedIndex.value].disabled)
    return focusedIndex.value
  const first = props.model.items.findIndex((item) => !item.disabled)
  return first >= 0 ? first : props.model.items.length
})
let trigger: HTMLButtonElement | null = null
let copyTimer: ReturnType<typeof setTimeout> | undefined

const resetCopyFeedback = () => {
  clearTimeout(copyTimer)
  copied.value = false
}
const showCopySuccess = () => {
  resetCopyFeedback()
  copied.value = true
  copyTimer = setTimeout(resetCopyFeedback, 1500)
}

const getElement = () => root.value
const getBounds = () => root.value?.getBoundingClientRect() ?? null
const getButtons = () =>
  Array.from(root.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
const focusFirstItem = () => {
  const first = getButtons()[0]
  if (!first) return
  focusedIndex.value = Array.from(root.value!.querySelectorAll('button')).indexOf(first)
  first.focus()
}
const closeMenu = () => {
  menuGroups.value = null
  expandedId.value = null
  trigger?.focus()
}
const openMenu = async (groups: ContextMenuItem[][], event: MouseEvent, id = 'more') => {
  trigger = event.currentTarget as HTMLButtonElement
  menuGroups.value = groups
  expandedId.value = id
  await nextTick()
  const bounds = trigger.getBoundingClientRect()
  const size = menu.value?.getBounds()
  if (!size) return
  menuPosition.value = constrainOverlayPosition({ x: bounds.left, y: bounds.bottom + 6 }, size)
  await nextTick()
  menu.value?.focusFirstItem()
}
const handleAction = (id: string) => {
  menuGroups.value = null
  expandedId.value = null
  emit('action', id)
}
const handleItem = (item: ContextMenuItem, event: MouseEvent) => {
  if (item.children) void openMenu([item.children], event, item.id)
  else handleAction(item.id)
}
const handlePointerDown = (event: PointerEvent) => {
  // 鼠标操作保留编辑器选区；键盘仍可以把焦点移入工具栏。
  if (event.button === 0) event.preventDefault()
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    emit('dismiss')
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = getButtons()
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
  focusedIndex.value = Array.from(root.value!.querySelectorAll('button')).indexOf(buttons[next])
  buttons[next]?.focus()
}
defineExpose({ getElement, getBounds, focusFirstItem, showCopySuccess })
watch(
  () => props.revision,
  () => {
    resetCopyFeedback()
    menuGroups.value = null
    expandedId.value = null
  },
)
watch(
  () => props.position,
  () => {
    if (menuGroups.value) closeMenu()
  },
)
onBeforeUnmount(resetCopyFeedback)
</script>

<template>
  <div
    ref="root"
    class="lume-floating-toolbar lume-selection-toolbar"
    role="toolbar"
    :aria-label="t('{0}操作', model.title)"
    :data-editor-overlay="overlayId"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop="handlePointerDown"
    @keydown.stop="handleKeydown"
    @contextmenu.prevent
  >
    <span v-if="!model.hideTitle" class="lume-selection-toolbar__label">{{ model.title }}</span>
    <button
      v-for="(item, index) in model.items"
      :key="item.id"
      type="button"
      :aria-label="item.id === 'copy' && copied ? t('已复制') : item.label"
      :data-tooltip="item.id === 'copy' && copied ? t('已复制') : (item.reason ?? item.label)"
      :title="item.reason"
      :disabled="item.disabled"
      :tabindex="tabstopIndex === index ? 0 : -1"
      :aria-pressed="item.active"
      :aria-haspopup="item.children ? 'menu' : undefined"
      :aria-expanded="item.children ? expandedId === item.id : undefined"
      :class="{
        'is-active': item.active === true,
        'is-mixed': item.active === 'mixed',
        'is-copied': item.id === 'copy' && copied,
      }"
      @click="handleItem(item, $event)"
    >
      <component
        :is="item.id === 'copy' && copied ? Check : (icons[item.icon ?? item.id] ?? MoreHorizontal)"
        :size="15"
        :stroke-width="2.1"
      />
    </button>
    <template v-if="hasMore">
      <span class="lume-floating-toolbar__separator" role="separator"></span>
      <button
        type="button"
        :aria-label="t('更多操作')"
        :data-tooltip="t('更多操作')"
        :tabindex="tabstopIndex === model.items.length ? 0 : -1"
        aria-haspopup="menu"
        :aria-expanded="expandedId === 'more'"
        @click="openMenu(model.more, $event)"
      >
        <MoreHorizontal :size="15" />
      </button>
    </template>
  </div>
  <EditorContextMenu
    v-if="menuGroups"
    ref="menu"
    :groups="menuGroups"
    :position="menuPosition"
    :overlay-id="overlayId"
    @action="handleAction"
    @close="closeMenu"
  />
</template>

<style scoped>
.lume-selection-toolbar {
  box-sizing: border-box;
  max-width: calc(100vw - 16px);
}
.lume-selection-toolbar__label {
  flex: none;
  max-width: 140px;
  padding: 0 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(var(--lume-font-size-base) - 2px);
}
.lume-selection-toolbar button.is-copied {
  color: var(--lume-accent-default);
}
</style>

<script setup lang="ts">
/**
 * DocumentTabs - 多文档标签栏
 *
 * 展示所有已打开文档，支持切换、关闭、新建和打开文件。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vLiquidGlass } from '@/ui/glass/directive'
import { FileDown, FileText, Plus, X } from 'lucide-vue-next'
import { useDocument, type DocumentDropPosition, type OpenDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { revealFileInFolder } from '@/platform/tauri/files'

const DRAG_THRESHOLD = 4
const revealFileLabel = /Mac/i.test(navigator.platform)
  ? '在 Finder 中显示'
  : /Win/i.test(navigator.platform)
    ? '在资源管理器中显示'
    : '在文件管理器中显示'

const props = withDefaults(
  defineProps<{
    fileDropPaths?: string[]
  }>(),
  {
    fileDropPaths: () => [],
  },
)

const {
  documents,
  activeDocumentId,
  activateDocument,
  moveDocument,
  requestCloseDocument,
  requestCloseDocuments,
} = useDocument()
const { newFile } = useFileOps()

const draggedDocumentId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<DocumentDropPosition | null>(null)
const dragOffsetX = ref(0)
const draggedTabWidth = ref(0)
const tabList = ref<HTMLElement | null>(null)
const contextMenu = ref<HTMLElement | null>(null)
const contextDocument = ref<OpenDocument | null>(null)
const contextMenuPosition = ref({ x: 0, y: 0 })
let pendingDocumentId: string | null = null
let activePointerId: number | null = null
let pointerStartX = 0
let suppressNextClick = false
let tabLayouts: Array<{ id: string; centerX: number }> = []
let resizeObserver: ResizeObserver | null = null

const contextDocumentIndex = computed(() =>
  contextDocument.value
    ? documents.value.findIndex((document) => document.id === contextDocument.value?.id)
    : -1,
)
const canCloseOtherDocuments = computed(() => documents.value.length > 1)
const canCloseLeftDocuments = computed(() => contextDocumentIndex.value > 0)
const markdownDropPaths = computed(() =>
  props.fileDropPaths.filter((path) => /\.(md|markdown)$/i.test(path)),
)
const fileDropLabel = computed(() => {
  if (markdownDropPaths.value.length === 0) return null
  if (markdownDropPaths.value.length > 1) {
    return `${markdownDropPaths.value.length} 个 Markdown`
  }
  return markdownDropPaths.value[0].split(/[\\/]/).pop() || 'Markdown'
})

const getTabElement = (documentId: string) =>
  Array.from(tabList.value?.querySelectorAll<HTMLElement>('.lume-tabs__tab') ?? []).find(
    (tab) => tab.dataset.documentId === documentId,
  )

const keepActiveTabVisible = () => {
  const list = tabList.value
  const tab = getTabElement(activeDocumentId.value)
  if (!list || !tab || draggedDocumentId.value || fileDropLabel.value) return

  const listBounds = list.getBoundingClientRect()
  const tabBounds = tab.getBoundingClientRect()
  if (tabBounds.left < listBounds.left) list.scrollLeft += tabBounds.left - listBounds.left
  else if (tabBounds.right > listBounds.right) list.scrollLeft += tabBounds.right - listBounds.right
}

const handleTabKeydown = async (event: KeyboardEvent, documentId: string) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

  const currentIndex = documents.value.findIndex((document) => document.id === documentId)
  if (currentIndex < 0) return
  event.preventDefault()

  let nextIndex = currentIndex
  if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = documents.value.length - 1
  else {
    const direction = event.key === 'ArrowRight' ? 1 : -1
    nextIndex = (currentIndex + direction + documents.value.length) % documents.value.length
  }

  const nextDocument = documents.value[nextIndex]
  activateDocument(nextDocument.id)
  await nextTick()
  getTabElement(nextDocument.id)?.querySelector<HTMLButtonElement>('.lume-tabs__activate')?.focus()
}

const handleTabWheel = (event: WheelEvent) => {
  const list = tabList.value
  if (!list || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
    return
  }
  if (list.scrollWidth <= list.clientWidth) return

  const scrollUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1
  list.scrollLeft += event.deltaY * scrollUnit
  event.preventDefault()
}

function closeContextMenu() {
  contextDocument.value = null
}

async function openContextMenu(event: MouseEvent, document: OpenDocument) {
  const menuWidth = 184
  const menuHeight = 160
  const margin = 8
  contextDocument.value = document
  contextMenuPosition.value = {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  }
  await nextTick()
  contextMenu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

function closeContextDocument() {
  const id = contextDocument.value?.id
  closeContextMenu()
  if (id) requestCloseDocument(id)
}

function closeOtherDocuments() {
  const id = contextDocument.value?.id
  closeContextMenu()
  if (id)
    requestCloseDocuments(
      documents.value.filter((document) => document.id !== id).map((document) => document.id),
    )
}

function closeLeftDocuments() {
  const index = contextDocumentIndex.value
  closeContextMenu()
  if (index > 0)
    requestCloseDocuments(documents.value.slice(0, index).map((document) => document.id))
}

function copyTextFallback(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('浏览器拒绝复制文件路径')
}

async function copyFilePath() {
  const path = contextDocument.value?.path
  closeContextMenu()
  if (!path) return

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(path)
      return
    } catch {
      // 部分 WebView 暴露 Clipboard API，但会因权限策略拒绝写入。
    }
  }

  try {
    copyTextFallback(path)
  } catch (error) {
    console.error('复制文件路径失败:', error)
  }
}

async function revealContextDocument() {
  const path = contextDocument.value?.path
  closeContextMenu()
  if (!path) return

  try {
    await revealFileInFolder(path)
  } catch (error) {
    console.error('在资源管理器中显示文件失败:', error)
  }
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeContextMenu()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = Array.from(
    contextMenu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  )
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

/** 关闭脏文档前提醒用户，防止误丢失内容。 */
function requestClose(document: OpenDocument) {
  requestCloseDocument(document.id)
}

function handleAuxClick(event: MouseEvent, document: OpenDocument) {
  if (event.button === 1) requestClose(document)
}

function resetDragState() {
  draggedDocumentId.value = null
  dropTargetId.value = null
  dropPosition.value = null
  dragOffsetX.value = 0
  draggedTabWidth.value = 0
  pendingDocumentId = null
  activePointerId = null
  tabLayouts = []
}

function handleTabClick(event: MouseEvent, documentId: string) {
  if (suppressNextClick && event.detail !== 0) {
    suppressNextClick = false
    return
  }
  suppressNextClick = false
  activateDocument(documentId)
}

function handlePointerDown(event: PointerEvent, documentId: string) {
  if (event.button !== 0 || !event.isPrimary) return
  if ((event.target as HTMLElement | null)?.closest('.lume-tabs__close')) {
    return
  }

  // A drag may end without a click; never suppress the next independent press.
  suppressNextClick = false
  pendingDocumentId = documentId
  activePointerId = event.pointerId
  pointerStartX = event.clientX
  if (event.currentTarget instanceof HTMLElement) {
    const tabGap = tabList.value
      ? Number.parseFloat(window.getComputedStyle(tabList.value).columnGap) || 0
      : 0
    draggedTabWidth.value = event.currentTarget.getBoundingClientRect().width + tabGap
  }

  tabLayouts = Array.from(
    tabList.value?.querySelectorAll<HTMLElement>('.lume-tabs__tab') ?? [],
  ).map((tab) => {
    const bounds = tab.getBoundingClientRect()
    return {
      id: tab.dataset.documentId ?? '',
      centerX: bounds.left + bounds.width / 2,
    }
  })
}

function updateDropTarget() {
  const sourceId = draggedDocumentId.value
  const sourceIndex = tabLayouts.findIndex((tab) => tab.id === sourceId)
  if (sourceIndex < 0) return

  const draggedCenterX = tabLayouts[sourceIndex].centerX + dragOffsetX.value
  const targetIndex = tabLayouts.filter(
    (tab) => tab.id !== sourceId && tab.centerX < draggedCenterX,
  ).length

  if (targetIndex === sourceIndex) {
    dropTargetId.value = null
    dropPosition.value = null
    return
  }

  dropTargetId.value = tabLayouts[targetIndex].id
  dropPosition.value = targetIndex < sourceIndex ? 'before' : 'after'
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId || !pendingDocumentId) return
  if (!(event.buttons & 1)) {
    resetDragState()
    return
  }
  if (!draggedDocumentId.value && Math.abs(event.clientX - pointerStartX) < DRAG_THRESHOLD) return

  // Leave ordinary clicks untouched in WebView2; capture only an actual drag.
  if (!draggedDocumentId.value && event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  event.preventDefault()
  draggedDocumentId.value = pendingDocumentId
  dragOffsetX.value = event.clientX - pointerStartX
  updateDropTarget()
}

function getTabStyle(documentId: string) {
  if (!draggedDocumentId.value) return undefined
  if (documentId === draggedDocumentId.value) {
    return { transform: `translate3d(${dragOffsetX.value}px, 0, 0)` }
  }

  const sourceIndex = documents.value.findIndex(
    (document) => document.id === draggedDocumentId.value,
  )
  const targetIndex = dropTargetId.value
    ? documents.value.findIndex((document) => document.id === dropTargetId.value)
    : sourceIndex
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return undefined

  if (targetIndex > sourceIndex) {
    const index = documents.value.findIndex((document) => document.id === documentId)
    if (index > sourceIndex && index <= targetIndex) {
      return { transform: `translate3d(-${draggedTabWidth.value}px, 0, 0)` }
    }
  } else {
    const index = documents.value.findIndex((document) => document.id === documentId)
    if (index >= targetIndex && index < sourceIndex) {
      return { transform: `translate3d(${draggedTabWidth.value}px, 0, 0)` }
    }
  }

  return undefined
}

function handlePointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return

  const sourceId = draggedDocumentId.value
  const targetId = dropTargetId.value
  const position = dropPosition.value
  if (sourceId) suppressNextClick = true

  if (sourceId && targetId && position) {
    moveDocument(sourceId, targetId, position)
  }

  const target = event.currentTarget
  if (target instanceof HTMLElement && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId)
  }
  resetDragState()
}

watch(
  [activeDocumentId, () => documents.value.map((document) => document.id)],
  keepActiveTabVisible,
  { flush: 'post' },
)

watch(fileDropLabel, async (label) => {
  await nextTick()
  if (label && tabList.value) tabList.value.scrollLeft = tabList.value.scrollWidth
  else keepActiveTabVisible()
})

onMounted(() => {
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('resize', closeContextMenu)
  window.addEventListener('keydown', handleWindowKeydown)
  resizeObserver = new ResizeObserver(keepActiveTabVisible)
  if (tabList.value) resizeObserver.observe(tabList.value)
  keepActiveTabVisible()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('keydown', handleWindowKeydown)
  resizeObserver?.disconnect()
})
</script>

<template>
  <nav
    class="lume-tabs"
    :class="{ 'lume-tabs--single': documents.length === 1 }"
    aria-label="打开的文档"
  >
    <div
      ref="tabList"
      class="lume-tabs__list"
      role="tablist"
      aria-label="打开的文档"
      aria-orientation="horizontal"
      @scroll="closeContextMenu"
      @wheel="handleTabWheel"
    >
      <div
        v-for="document in documents"
        :key="document.id"
        v-liquid-glass="document.id === activeDocumentId || document.id === draggedDocumentId"
        class="lume-tabs__tab"
        :data-document-id="document.id"
        :class="{
          'lume-tabs__tab--active': document.id === activeDocumentId,
          'lume-tabs__tab--dragging': document.id === draggedDocumentId,
        }"
        :style="getTabStyle(document.id)"
        role="presentation"
        :title="document.path || document.name"
        @click="handleTabClick($event, document.id)"
        @auxclick="handleAuxClick($event, document)"
        @contextmenu.prevent="openContextMenu($event, document)"
        @pointerdown="handlePointerDown($event, document.id)"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="resetDragState"
      >
        <button
          :id="`lume-document-tab-${document.id}`"
          class="lume-tabs__activate"
          type="button"
          role="tab"
          :aria-selected="document.id === activeDocumentId"
          :aria-label="`${document.name}${document.isDirty ? '，未保存' : ''}`"
          aria-controls="lume-document-panel"
          :tabindex="document.id === activeDocumentId ? 0 : -1"
          @keydown="handleTabKeydown($event, document.id)"
        >
          <FileText
            class="lume-tabs__file-icon"
            :size="14"
            :stroke-width="1.6"
            aria-hidden="true"
          />
          <span class="lume-tabs__name">{{ document.name }}</span>
        </button>
        <button
          class="lume-tabs__close"
          :class="{ 'lume-tabs__close--dirty': document.isDirty }"
          type="button"
          :tabindex="document.id === activeDocumentId ? 0 : -1"
          :aria-label="`关闭 ${document.name}${document.isDirty ? '（未保存）' : ''}`"
          @click.stop="requestClose(document)"
          @pointerdown.stop
        >
          <span v-if="document.isDirty" class="lume-tabs__dirty" aria-hidden="true"></span>
          <X class="lume-tabs__close-icon" :size="13" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>

      <div v-if="fileDropLabel" class="lume-tabs__drop-preview" aria-live="polite">
        <FileDown class="lume-tabs__drop-icon" :size="14" :stroke-width="1.6" />
        <span class="lume-tabs__name">{{ fileDropLabel }}</span>
      </div>
    </div>
    <button
      class="lume-tabs__new"
      type="button"
      title="新建文档 (Ctrl+N)"
      aria-label="新建文档"
      @click="newFile"
    >
      <Plus :size="16" :stroke-width="1.8" aria-hidden="true" />
    </button>
  </nav>

  <Teleport to="body">
    <div
      v-if="contextDocument"
      ref="contextMenu"
      class="lume-tabs__context-menu"
      role="menu"
      :aria-label="`${contextDocument.name} 标签操作`"
      :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @pointerdown.stop
    >
      <button type="button" role="menuitem" @click="closeContextDocument">
        <span>关闭</span>
      </button>
      <button
        type="button"
        role="menuitem"
        :disabled="!canCloseOtherDocuments"
        @click="closeOtherDocuments"
      >
        <span>关闭其他标签</span>
      </button>
      <button
        type="button"
        role="menuitem"
        :disabled="!canCloseLeftDocuments"
        @click="closeLeftDocuments"
      >
        <span>关闭左侧标签</span>
      </button>
      <div class="lume-tabs__context-separator" role="separator"></div>
      <button type="button" role="menuitem" :disabled="!contextDocument.path" @click="copyFilePath">
        <span>复制文件路径</span>
      </button>
      <button
        type="button"
        role="menuitem"
        :disabled="!contextDocument.path"
        @click="revealContextDocument"
      >
        <span>{{ revealFileLabel }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-tabs {
  height: var(--lume-titlebar-height);
  display: flex;
  flex-shrink: 0;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  background: transparent;
  user-select: none;
}

.lume-tabs__list {
  flex: 0 1 auto;
  display: flex;
  min-width: 0;
  height: 100%;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.lume-tabs__list::-webkit-scrollbar {
  display: none;
}

.lume-tabs__tab {
  position: relative;
  flex: 0 1 auto;
  width: max-content;
  min-width: 96px;
  max-width: 200px;
  height: 28px;
  display: flex;
  align-items: center;
  padding-right: 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--lume-text-secondary);
  cursor: default;
  touch-action: none;
  transition:
    transform 140ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease,
    color 120ms ease;
}

.lume-tabs__tab--dragging {
  cursor: grabbing;
  transition: none;
  will-change: transform;
}
.lume-tabs__tab:hover {
  background-color: color-mix(in srgb, var(--lume-text-secondary) 6%, transparent);
  color: var(--lume-text-primary);
}

.lume-tabs__tab--active,
.lume-tabs__tab--active:hover,
.lume-tabs__tab--dragging,
.lume-tabs__tab--dragging:hover {
  z-index: 1;
  background: var(--lume-glass-reflection), var(--lume-glass-surface);
  backdrop-filter: var(--lume-glass-filter, blur(8px)) blur(0.4px);
  -webkit-backdrop-filter: var(--lume-glass-filter, blur(8px)) blur(0.4px);
  box-shadow:
    inset 0 0 0 1px var(--lume-glass-highlight),
    inset 0 1px 0 var(--lume-glass-rim),
    inset 0 -1px 1px var(--lume-glass-depth),
    0 2px 5px var(--lume-glass-shadow);
  color: var(--lume-text-primary);
}

.lume-tabs__tab--active .lume-tabs__file-icon {
  color: var(--lume-text-secondary);
  opacity: 1;
}

.lume-tabs__tab--active .lume-tabs__name {
  font-weight: var(--lume-font-weight-medium);
}

.lume-tabs--single
  .lume-tabs__tab:not(:hover):not(:focus-within)
  .lume-tabs__close:not(.lume-tabs__close--dirty) {
  opacity: 0;
}

.lume-tabs__tab--dragging,
.lume-tabs__tab--dragging:hover {
  z-index: 2;
}

.lume-tabs__activate {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--lume-space-3);
  min-width: 0;
  height: 100%;
  padding: 0 4px 0 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: inherit;
}

.lume-tabs__file-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.lume-tabs__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--lume-font-size-sm);
  text-align: left;
}

.lume-tabs__dirty {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: var(--lume-radius-full);
  background-color: var(--lume-text-tertiary);
}

.lume-tabs__drop-preview {
  position: relative;
  min-width: 132px;
  max-width: 220px;
  height: 28px;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--lume-space-3);
  margin-left: 4px;
  padding: 0 var(--lume-space-4);
  border: 1px dashed color-mix(in srgb, var(--lume-accent-default) 40%, transparent);
  border-radius: 6px;
  background-color: var(--lume-accent-subtle);
  color: var(--lume-text-secondary);
  opacity: 0.72;
  pointer-events: none;
}

.lume-tabs__drop-icon {
  flex-shrink: 0;
  color: var(--lume-accent-default);
}

.lume-tabs__close {
  width: 20px;
  height: 20px;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
}

.lume-tabs__close--dirty {
  opacity: 1;
}

.lume-tabs__close--dirty .lume-tabs__close-icon {
  display: none;
}

.lume-tabs__tab:hover .lume-tabs__close--dirty .lume-tabs__dirty,
.lume-tabs__tab:focus-within .lume-tabs__close--dirty .lume-tabs__dirty {
  display: none;
}

.lume-tabs__tab:hover .lume-tabs__close--dirty .lume-tabs__close-icon,
.lume-tabs__tab:focus-within .lume-tabs__close--dirty .lume-tabs__close-icon {
  display: block;
}

.lume-tabs__tab:hover .lume-tabs__close,
.lume-tabs__tab:focus-within .lume-tabs__close,
.lume-tabs__tab--active .lume-tabs__close {
  opacity: 1;
}

.lume-tabs__close:hover {
  background-color: color-mix(in srgb, var(--lume-text-primary) 10%, transparent);
  color: var(--lume-text-primary);
}

.lume-tabs__new {
  width: 30px;
  height: 30px;
  display: inline-flex;
  flex-shrink: 0;
  align-self: center;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-tabs__new:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-tabs__activate:focus-visible,
.lume-tabs__new:focus-visible,
.lume-tabs__close:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-tabs__context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  width: 184px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: blur(14px);
}

.lume-tabs__context-menu button {
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

.lume-tabs__context-menu button:hover:not(:disabled),
.lume-tabs__context-menu button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-tabs__context-menu button:disabled {
  color: var(--lume-text-tertiary);
  opacity: 0.45;
}

.lume-tabs__context-separator {
  height: 1px;
  margin: var(--lume-space-2) var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .lume-tabs__tab {
    transition: none;
  }
}
</style>

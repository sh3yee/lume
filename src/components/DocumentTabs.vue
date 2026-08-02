<script setup lang="ts">
/**
 * DocumentTabs - 多文档标签栏
 *
 * 展示所有已打开文档，支持切换、关闭、新建和打开文件。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FileDown, FileText, Plus, X } from 'lucide-vue-next'
import {
  useDocument,
  type DocumentDropPosition,
  type OpenDocument,
} from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { revealFileInFolder } from '@/platform/tauri/files'

const props = withDefaults(defineProps<{
  fileDropPaths?: string[]
}>(), {
  fileDropPaths: () => [],
})

const {
  documents,
  activeDocumentId,
  activateDocument,
  moveDocument,
  requestCloseDocument,
  requestCloseDocuments,
} = useDocument()
const { newFile } = useFileOps()

const DRAG_THRESHOLD = 4

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

const contextDocumentIndex = computed(() => contextDocument.value
  ? documents.value.findIndex((document) => document.id === contextDocument.value?.id)
  : -1)
const canCloseOtherDocuments = computed(() => documents.value.length > 1)
const canCloseLeftDocuments = computed(() => contextDocumentIndex.value > 0)
const revealFileLabel = /Mac/i.test(navigator.platform)
  ? '在 Finder 中显示'
  : /Win/i.test(navigator.platform)
    ? '在资源管理器中显示'
    : '在文件管理器中显示'

const markdownDropPaths = computed(() => props.fileDropPaths.filter((path) =>
  /\.(md|markdown)$/i.test(path),
))
const fileDropLabel = computed(() => {
  if (markdownDropPaths.value.length === 0) return null
  if (markdownDropPaths.value.length > 1) {
    return `${markdownDropPaths.value.length} 个 Markdown`
  }
  return markdownDropPaths.value[0].split(/[\\/]/).pop() || 'Markdown'
})

watch(fileDropLabel, async (label) => {
  if (!label) return
  await nextTick()
  if (tabList.value) tabList.value.scrollLeft = tabList.value.scrollWidth
})

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
  if (id) requestCloseDocuments(documents.value
    .filter((document) => document.id !== id)
    .map((document) => document.id))
}

function closeLeftDocuments() {
  const index = contextDocumentIndex.value
  closeContextMenu()
  if (index > 0) requestCloseDocuments(documents.value.slice(0, index).map((document) => document.id))
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

onMounted(() => {
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
  window.addEventListener('resize', closeContextMenu)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('keydown', handleWindowKeydown)
})

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

function handleTabClick(documentId: string) {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  activateDocument(documentId)
}

function handlePointerDown(event: PointerEvent, documentId: string) {
  if (event.button !== 0 || !event.isPrimary) return
  if ((event.target as HTMLElement | null)?.closest('.lume-tabs__close')) {
    return
  }

  pendingDocumentId = documentId
  activePointerId = event.pointerId
  pointerStartX = event.clientX
  if (event.currentTarget instanceof HTMLElement) {
    draggedTabWidth.value = event.currentTarget.getBoundingClientRect().width
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  tabLayouts = Array.from(document.querySelectorAll<HTMLElement>('.lume-tabs__tab')).map((tab) => {
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
  const targetIndex = tabLayouts
    .filter((tab) => tab.id !== sourceId && tab.centerX < draggedCenterX)
    .length

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
  if (!draggedDocumentId.value && Math.abs(event.clientX - pointerStartX) < DRAG_THRESHOLD) return

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

  const sourceIndex = documents.value.findIndex((document) => document.id === draggedDocumentId.value)
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
</script>

<template>
  <nav class="lume-tabs" aria-label="打开的文档">
    <div ref="tabList" class="lume-tabs__list" role="tablist" @scroll="closeContextMenu">
      <button
        v-for="document in documents"
        :key="document.id"
        class="lume-tabs__tab"
:data-document-id="document.id"
        :class="{
          'lume-tabs__tab--active': document.id === activeDocumentId,
          'lume-tabs__tab--dragging': document.id === draggedDocumentId,
        }" :style="getTabStyle(document.id)"
        type="button"
        role="tab"
        :aria-selected="document.id === activeDocumentId"
        :title="document.path || document.name"
@click="handleTabClick(document.id)"
        @auxclick="handleAuxClick($event, document)"
        @contextmenu.prevent="openContextMenu($event, document)"
@pointerdown="handlePointerDown($event, document.id)"
        @pointermove="handlePointerMove" @pointerup="handlePointerUp" @pointercancel="resetDragState"
      >
        <FileText class="lume-tabs__file-icon" :size="14" :stroke-width="1.6" />
        <span class="lume-tabs__name">{{ document.name }}</span>
        <span v-if="document.isDirty" class="lume-tabs__dirty" aria-label="未保存"></span>
        <span
          class="lume-tabs__close"
          role="button"
          tabindex="0"
          :aria-label="`关闭 ${document.name}`"
          @click.stop="requestClose(document)"
          @keydown.enter.stop="requestClose(document)"
          @keydown.space.prevent.stop="requestClose(document)"
        >
          <X :size="13" :stroke-width="1.8" />
        </span>
      </button>

      <div v-if="fileDropLabel" class="lume-tabs__drop-preview" aria-live="polite">
        <FileDown class="lume-tabs__drop-icon" :size="14" :stroke-width="1.6" />
        <span class="lume-tabs__name">{{ fileDropLabel }}</span>
      </div>

      <button class="lume-tabs__new" type="button" title="新建文档 (Ctrl+N)" aria-label="新建文档" @click="newFile">
        <Plus :size="16" :stroke-width="1.8" />
      </button>
    </div>
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
      <button type="button" role="menuitem" :disabled="!canCloseOtherDocuments" @click="closeOtherDocuments">
        <span>关闭其他标签</span>
      </button>
      <button type="button" role="menuitem" :disabled="!canCloseLeftDocuments" @click="closeLeftDocuments">
        <span>关闭左侧标签</span>
      </button>
      <div class="lume-tabs__context-separator" role="separator"></div>
      <button type="button" role="menuitem" :disabled="!contextDocument.path" @click="copyFilePath">
        <span>复制文件路径</span>
      </button>
      <button type="button" role="menuitem" :disabled="!contextDocument.path" @click="revealContextDocument">
        <span>{{ revealFileLabel }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-tabs {
  height: 38px;
  display: flex;
  flex-shrink: 0;
  min-width: 0;
  background-color: var(--lume-bg-base);
  border-bottom: 1px solid var(--lume-border-subtle);
  user-select: none;
}

.lume-tabs__list {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.lume-tabs__list::-webkit-scrollbar {
  display: none;
}

.lume-tabs__tab {
  position: relative;
  min-width: 132px;
  max-width: 220px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: 0 var(--lume-space-3) 0 var(--lume-space-4);
  border: none;
  border-right: 1px solid var(--lume-border-subtle);
  border-radius: 0;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: grab;
    touch-action: none;
    transition: transform 140ms ease;
    will-change: transform;
}

.lume-tabs__tab::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background-color: transparent;
}

.lume-tabs__tab--dragging {
  z-index: 2;
  background-color: var(--lume-bg-surface-raised);
  box-shadow: 0 4px 12px rgb(0 0 0 / 14%);
  cursor: grabbing;
  transition: none;
}
.lume-tabs__tab:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
}

.lume-tabs__tab--active {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-tabs__tab--active::after {
  background-color: var(--lume-accent-default);
}

.lume-tabs__file-icon {
  flex-shrink: 0;
  color: var(--lume-accent-default);
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
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: var(--lume-radius-full);
  background-color: var(--lume-accent-default);
}

.lume-tabs__drop-preview {
  position: relative;
  min-width: 132px;
  max-width: 220px;
  height: 100%;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--lume-space-3);
  padding: 0 var(--lume-space-4);
  border-right: 1px solid var(--lume-border-subtle);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  opacity: 0.72;
  pointer-events: none;
}

.lume-tabs__drop-preview::after {
  content: '';
  position: absolute;
  right: var(--lume-space-3);
  bottom: 0;
  left: var(--lume-space-3);
  height: 2px;
  background-color: color-mix(in srgb, var(--lume-accent-default) 55%, transparent);
}

.lume-tabs__drop-icon {
  flex-shrink: 0;
  color: var(--lume-accent-default);
}

.lume-tabs__close {
  width: 20px;
  height: 20px;
  display: none;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-sm);
}

.lume-tabs__tab:hover .lume-tabs__close,
.lume-tabs__tab--active .lume-tabs__close {
  display: inline-flex;
}

.lume-tabs__tab:hover .lume-tabs__dirty,
.lume-tabs__tab--active .lume-tabs__dirty {
  display: none;
}

.lume-tabs__close:hover {
  background-color: var(--lume-border-subtle);
  color: var(--lume-text-primary);
}

.lume-tabs__new {
  width: 38px;
  height: 100%;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-tabs__new:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-tabs__tab:focus-visible,
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
</style>

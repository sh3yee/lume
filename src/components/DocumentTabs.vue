<script setup lang="ts">
/**
 * DocumentTabs - 多文档标签栏
 *
 * 展示所有已打开文档，支持切换、关闭、新建和打开文件。
 */
import { ref } from 'vue'
import { FileText, Plus, X } from 'lucide-vue-next'
import {
  useDocument,
  type DocumentDropPosition,
  type OpenDocument,
} from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'

const {
  documents,
  activeDocumentId,
  activateDocument,
  moveDocument,
  requestCloseDocument,
} = useDocument()
const { newFile } = useFileOps()

const DRAG_THRESHOLD = 4

const draggedDocumentId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropPosition = ref<DocumentDropPosition | null>(null)
const dragOffsetX = ref(0)
const draggedTabWidth = ref(0)
let pendingDocumentId: string | null = null
let activePointerId: number | null = null
let pointerStartX = 0
let suppressNextClick = false
let tabLayouts: Array<{ id: string; centerX: number }> = []

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
    <div class="lume-tabs__list" role="tablist">
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

      <button class="lume-tabs__new" type="button" title="新建文档 (Ctrl+N)" aria-label="新建文档" @click="newFile">
        <Plus :size="16" :stroke-width="1.8" />
      </button>
    </div>
  </nav>
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
</style>
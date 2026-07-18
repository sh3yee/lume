<script setup lang="ts">
/**
 * DocumentTabs - 多文档标签栏
 *
 * 展示所有已打开文档，支持切换、关闭、新建和打开文件。
 */
import { FileText, Plus, X } from 'lucide-vue-next'
import { useDocument, type OpenDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'

const { documents, activeDocumentId, activateDocument, requestCloseDocument } = useDocument()
const { newFile } = useFileOps()

/** 关闭脏文档前提醒用户，防止误丢失内容。 */
function requestClose(document: OpenDocument) {
  requestCloseDocument(document.id)
}

function handleAuxClick(event: MouseEvent, document: OpenDocument) {
  if (event.button === 1) requestClose(document)
}
</script>

<template>
  <nav class="lume-tabs" aria-label="打开的文档">
    <div class="lume-tabs__list" role="tablist">
      <button
        v-for="document in documents"
        :key="document.id"
        class="lume-tabs__tab"
        :class="{ 'lume-tabs__tab--active': document.id === activeDocumentId }"
        type="button"
        role="tab"
        :aria-selected="document.id === activeDocumentId"
        :title="document.path || document.name"
        @click="activateDocument(document.id)"
        @auxclick="handleAuxClick($event, document)"
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
  cursor: default;
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
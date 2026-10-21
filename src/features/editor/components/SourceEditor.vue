<script setup lang="ts">
/**
 * SourceEditor - Markdown 源码编辑器
 *
 * 当前使用原生 textarea，后续可在保持 Document Store 边界不变的情况下替换为 CodeMirror 6。
 */
import { nextTick, onMounted, ref, watch } from 'vue'
import { useDocument } from '../../documents/model/useDocument.ts'
import { useSourceImages } from '@/features/images/editor/useSourceImages'
import { createMarkdownPreview, useSourceEmojiCompletion } from '../extensions'

const props = defineProps<{
  syncRatio?: number
}>()

const emit = defineEmits<{
  (e: 'scroll-ratio', value: number): void
}>()

const { content, updateCursor } = useDocument()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
let isApplyingScrollSync = false
const images = useSourceImages(textareaRef, (element) => syncCursor(element))
const emoji = useSourceEmojiCompletion(
  textareaRef,
  (element) => syncCursor(element),
  createMarkdownPreview(),
)
const { insertLocalImages, insertImage, replaceImageSources, setImageMetadata } = images
defineExpose({
  focus: () => textareaRef.value?.focus(),
  insertLocalImages,
  insertImage,
  replaceImageSources,
  setImageMetadata,
})

function syncCursor(element: HTMLTextAreaElement) {
  const lines = element.value.substring(0, element.selectionStart).split('\n')
  updateCursor(lines.length, lines[lines.length - 1].length + 1)
}

function handleInput(event: Event) {
  const element = event.target as HTMLTextAreaElement
  content.value = element.value
  syncCursor(element)
  emoji.handleInput()
}

function handleScroll(event: Event) {
  const element = event.target as HTMLTextAreaElement
  emoji.close()
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  const ratio = maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0
  if (!isApplyingScrollSync) emit('scroll-ratio', ratio)
}

function handleKeydown(event: KeyboardEvent) {
  images.handleKeydown(event)
  if (emoji.handleKeydown(event)) return
  if (event.key !== 'Tab') return
  event.preventDefault()
  const element = event.target as HTMLTextAreaElement
  const start = element.selectionStart
  content.value = `${element.value.substring(0, start)}  ${element.value.substring(element.selectionEnd)}`
  void nextTick(() => {
    element.selectionStart = element.selectionEnd = start + 2
    syncCursor(element)
  })
}

function handleCursorChange(event: Event) {
  syncCursor(event.target as HTMLTextAreaElement)
  emoji.handleSelectionChange()
}

watch(
  () => props.syncRatio,
  (ratio) => {
    const element = textareaRef.value
    if (!element || typeof ratio !== 'number' || !Number.isFinite(ratio)) return
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    isApplyingScrollSync = true
    emoji.close()
    element.scrollTop = ratio * maxScrollTop
    requestAnimationFrame(() => {
      isApplyingScrollSync = false
    })
  },
)

onMounted(() => {
  if (textareaRef.value) syncCursor(textareaRef.value)
})
</script>

<template>
  <section class="lume-source-editor">
    <textarea
      ref="textareaRef"
      class="lume-source-editor__textarea"
      :value="content"
      spellcheck="false"
      placeholder="开始输入 Markdown..."
      @input="handleInput"
      @keyup="handleCursorChange"
      @click="handleCursorChange"
      @keydown="handleKeydown"
      @blur="emoji.close"
      @compositionstart="emoji.handleCompositionStart"
      @compositionend="emoji.handleCompositionEnd"
      @scroll="handleScroll"
      @paste="images.handlePaste"
      @drop="images.handleDrop"
    ></textarea>
  </section>
</template>

<style scoped>
.lume-source-editor {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--lume-panel-border);
  border-radius: var(--lume-radius-lg);
  background-color: var(--lume-pane-bg);
  box-shadow: var(--lume-shadow-xs);
}
.lume-source-editor__textarea {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: var(--lume-space-7);
  border: none;
  outline: none;
  resize: none;
  background-color: transparent;
  color: var(--lume-text-primary);
  caret-color: var(--lume-accent-default);
  font-family: var(--lume-font-mono, 'Cascadia Code', 'Fira Code', Consolas, monospace);
  font-size: var(--lume-font-size-md);
  line-height: 1.85;
  letter-spacing: 0.1px;
  tab-size: 2;
  -moz-tab-size: 2;
}
.lume-source-editor__textarea::placeholder {
  color: var(--lume-text-tertiary);
}
.lume-source-editor__textarea::selection {
  background-color: var(--lume-accent-subtle);
}
.lume-source-editor__textarea::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.lume-source-editor__textarea::-webkit-scrollbar-track {
  background: transparent;
}
.lume-source-editor__textarea::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: var(--lume-radius-full);
  background-color: var(--lume-border-default);
  background-clip: padding-box;
}
.lume-source-editor__textarea::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}
</style>

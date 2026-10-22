<script setup lang="ts">
/**
 * SourceEditor - Markdown 源码编辑器
 *
 * 当前使用原生 textarea，后续可在保持 Document Store 边界不变的情况下替换为 CodeMirror 6。
 */
import { t } from '@/app/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDocument } from '../../documents/model/useDocument.ts'
import { useSourceImages } from '@/features/images/editor/useSourceImages'
import { createMarkdownPreview, useSourceEmojiCompletion } from '../extensions'
import { highlightMarkdownSource } from '../source/markdownHighlight'

const props = defineProps<{
  syncRatio?: number
}>()

const emit = defineEmits<{
  (e: 'scroll-ratio', value: number): void
}>()

const { content, updateCursor } = useDocument()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const mirrorRef = ref<HTMLElement | null>(null)
const lineHeights = ref<number[]>([])
const scrollTop = ref(0)
const lines = computed(() => content.value.split('\n'))
const highlightedLines = computed(() => highlightMarkdownSource(content.value))
let resizeObserver: ResizeObserver | null = null
let styleObserver: MutationObserver | null = null
let measureFrame = 0
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
  scrollTop.value = element.scrollTop
  emoji.close()
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  const ratio = maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0
  if (!isApplyingScrollSync) emit('scroll-ratio', ratio)
}

const measureLines = () => {
  const textarea = textareaRef.value
  const mirror = mirrorRef.value
  if (!textarea || !mirror) return
  const style = getComputedStyle(textarea)
  mirror.style.width = `${textarea.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`
  lineHeights.value = Array.from(mirror.children, (line) => line.getBoundingClientRect().height)
  scrollTop.value = textarea.scrollTop
}

const scheduleMeasureLines = () => {
  cancelAnimationFrame(measureFrame)
  measureFrame = requestAnimationFrame(measureLines)
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
    scrollTop.value = element.scrollTop
    requestAnimationFrame(() => {
      isApplyingScrollSync = false
    })
  },
)

watch(content, scheduleMeasureLines, { flush: 'post' })

onMounted(() => {
  if (textareaRef.value) syncCursor(textareaRef.value)
  resizeObserver = new ResizeObserver(scheduleMeasureLines)
  if (textareaRef.value) resizeObserver.observe(textareaRef.value)
  styleObserver = new MutationObserver(scheduleMeasureLines)
  styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  document.fonts.addEventListener('loadingdone', scheduleMeasureLines)
  scheduleMeasureLines()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  styleObserver?.disconnect()
  cancelAnimationFrame(measureFrame)
  document.fonts.removeEventListener('loadingdone', scheduleMeasureLines)
})
</script>

<template>
  <section class="lume-source-editor">
    <div class="lume-source-editor__gutter" aria-hidden="true">
      <div :style="{ transform: `translateY(${-scrollTop}px)` }">
        <div
          v-for="(_, index) in lines"
          :key="index"
          :style="{ height: lineHeights[index] ? `${lineHeights[index]}px` : undefined }"
        >
          {{ index + 1 }}
        </div>
      </div>
    </div>
    <div class="lume-source-editor__body">
      <div class="lume-source-editor__highlight" aria-hidden="true">
        <div
          ref="mirrorRef"
          class="lume-source-editor__mirror"
          :style="{ transform: `translateY(${-scrollTop}px)` }"
        >
          <div v-for="(tokens, index) in highlightedLines" :key="index">
            <template v-if="tokens.length">
              <span
                v-for="(token, tokenIndex) in tokens"
                :key="tokenIndex"
                :class="{ 'lume-source-editor__syntax': token.syntax }"
                >{{ token.text }}</span
              >
            </template>
            <template v-else>{{ '\u200b' }}</template>
          </div>
        </div>
      </div>
      <textarea
        ref="textareaRef"
        class="lume-source-editor__textarea"
        :value="content"
        spellcheck="false"
        :placeholder="t('开始输入 Markdown...')"
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
    </div>
  </section>
</template>

<style scoped>
.lume-source-editor {
  position: relative;
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
.lume-source-editor__gutter,
.lume-source-editor__mirror,
.lume-source-editor__textarea {
  font-family: var(--lume-font-mono, 'Cascadia Code', 'Fira Code', Consolas, monospace);
  font-size: var(--lume-writing-font-size, 15px);
  line-height: var(--lume-writing-line-height, 1.65);
  letter-spacing: 0.1px;
  tab-size: 2;
}
.lume-source-editor__gutter {
  flex-shrink: 0;
  min-width: 3ch;
  padding: var(--lume-space-7) 12px var(--lume-space-7) 16px;
  overflow: hidden;
  color: var(--lume-text-tertiary);
  text-align: right;
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.lume-source-editor__body {
  position: relative;
  flex: 1;
  min-width: 0;
}
.lume-source-editor__highlight,
.lume-source-editor__textarea {
  padding: var(--lume-space-7) var(--lume-space-7) var(--lume-space-7) 4px;
}
.lume-source-editor__highlight {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.lume-source-editor__mirror,
.lume-source-editor__textarea {
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.lume-source-editor__mirror {
  color: var(--lume-text-primary);
}
.lume-source-editor__syntax {
  color: var(--lume-accent-default);
  font-style: italic;
}
.lume-source-editor__textarea {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  border: none;
  outline: none;
  resize: none;
  background-color: transparent;
  /* 文字由高亮层绘制，输入、光标和选区仍使用原生文本框。 */
  color: transparent;
  caret-color: var(--lume-accent-default);
  -moz-tab-size: 2;
}
.lume-source-editor__textarea::placeholder {
  color: var(--lume-text-tertiary);
}
.lume-source-editor__textarea::selection {
  background-color: var(--lume-accent-subtle);
  color: var(--lume-text-primary);
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

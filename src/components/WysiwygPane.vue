<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 contenteditable 渲染 Markdown HTML，实现所见即所得编辑。
 * - 渲染：markdown-it 将 Markdown 转为 HTML
 * - 编辑：用户直接在渲染结果上编辑
 * - 同步：turndown 将编辑后的 HTML 转回 Markdown 存入 useDocument
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import { useDocument } from '@composables/useDocument'

const { content, updateCursor } = useDocument()

/** 配置 markdown-it */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
})

/** 配置 turndown（HTML → Markdown） */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
})

/** 实时渲染 HTML */
const renderedHtml = computed(() => md.render(content.value))

const editorRef = ref<HTMLDivElement | null>(null)

/** 内部标记，避免循环更新 */
let isInternalUpdate = false

/** 用户编辑后将 HTML 转回 Markdown */
function handleInput() {
  if (!editorRef.value) return
  isInternalUpdate = true
  const html = editorRef.value.innerHTML
  const markdown = turndown.turndown(html)
  content.value = markdown
  syncCursor()
  nextTick(() => {
    isInternalUpdate = false
  })
}

/** 同步光标行列位置 */
function syncCursor() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return

  const range = sel.getRangeAt(0)
  const fullText = editorRef.value?.innerText || ''

  // 计算光标前所有文本的偏移量
  const preRange = document.createRange()
  preRange.selectNodeContents(editorRef.value!)
  preRange.setEnd(range.startContainer, range.startOffset)
  const beforeText = preRange.toString()
  const pos = beforeText.length

  const before = fullText.substring(0, pos)
  const lines = before.split('\n')
  updateCursor(lines.length, lines[lines.length - 1].length + 1)
}

/** 处理光标移动 */
function handleKeyup() {
  syncCursor()
}

/** 处理点击选区 */
function handleClick() {
  syncCursor()
}

/** 支持 Tab 缩进 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
  }
}

/** 外部 content 变化时更新编辑器内容（如打开文件） */
watch(content, (newVal) => {
  if (isInternalUpdate) return
  if (editorRef.value) {
    editorRef.value.innerHTML = md.render(newVal)
  }
})

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = renderedHtml.value
  }
})
</script>

<template>
  <section class="lume-wysiwyg-pane">
    <div
      ref="editorRef"
      class="lume-wysiwyg-pane__content"
      contenteditable="true"
      spellcheck="false"
      @input="handleInput"
      @keyup="handleKeyup"
      @click="handleClick"
      @keydown="handleKeydown"
    ></div>
  </section>
</template>

<style scoped>
.lume-wysiwyg-pane {
  flex: 1;
  display: flex;
  background-color: var(--lume-bg-surface-raised);
  overflow: hidden;
  min-width: 0;
}

.lume-wysiwyg-pane__content {
  flex: 1;
  max-width: var(--lume-preview-max-width);
  margin: 0 auto;
  padding: var(--lume-space-8) var(--lume-space-10);
  overflow-y: auto;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
  outline: none;
}

/* 滚动条 */
.lume-wysiwyg-pane__content::-webkit-scrollbar {
  width: 10px;
}

.lume-wysiwyg-pane__content::-webkit-scrollbar-track {
  background: transparent;
}

.lume-wysiwyg-pane__content::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid var(--lume-bg-surface-raised);
}

.lume-wysiwyg-pane__content::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}

/* Markdown 元素样式 */
.lume-wysiwyg-pane__content :deep(h1) {
  font-size: 1.8em;
  font-weight: var(--lume-font-weight-bold);
  margin: var(--lume-space-8) 0 var(--lume-space-4);
  padding-bottom: var(--lume-space-2);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(h2) {
  font-size: 1.4em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-7) 0 var(--lume-space-3);
  padding-bottom: var(--lume-space-1);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(h3) {
  font-size: 1.2em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-6) 0 var(--lume-space-3);
}

.lume-wysiwyg-pane__content :deep(h4),
.lume-wysiwyg-pane__content :deep(h5),
.lume-wysiwyg-pane__content :deep(h6) {
  font-size: 1em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-5) 0 var(--lume-space-2);
}

.lume-wysiwyg-pane__content :deep(p) {
  margin: var(--lume-space-3) 0;
}

.lume-wysiwyg-pane__content :deep(a) {
  color: var(--lume-accent-default);
  text-decoration: none;
  transition: color var(--lume-transition-fast);
}

.lume-wysiwyg-pane__content :deep(a:hover) {
  color: var(--lume-accent-hover);
  text-decoration: underline;
}

.lume-wysiwyg-pane__content :deep(strong) {
  font-weight: var(--lume-font-weight-bold);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__content :deep(em) {
  font-style: italic;
}

.lume-wysiwyg-pane__content :deep(ul),
.lume-wysiwyg-pane__content :deep(ol) {
  padding-left: var(--lume-space-6);
  margin: var(--lume-space-3) 0;
}

.lume-wysiwyg-pane__content :deep(li) {
  margin: var(--lume-space-1) 0;
}

.lume-wysiwyg-pane__content :deep(blockquote) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-2) var(--lume-space-5);
  border-left: 3px solid var(--lume-accent-default);
  background-color: var(--lume-accent-subtle);
  border-radius: 0 var(--lume-radius-sm) var(--lume-radius-sm) 0;
  color: var(--lume-text-secondary);
}

.lume-wysiwyg-pane__content :deep(blockquote p) {
  margin: var(--lume-space-1) 0;
}

.lume-wysiwyg-pane__content :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 0.875em;
  padding: var(--lume-space-1) var(--lume-space-2);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-sm);
}

.lume-wysiwyg-pane__content :deep(pre) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-4) var(--lume-space-5);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-md);
  overflow-x: auto;
}

.lume-wysiwyg-pane__content :deep(pre code) {
  padding: 0;
  background: none;
  border: none;
  font-size: 0.875em;
  line-height: 1.6;
}

.lume-wysiwyg-pane__content :deep(hr) {
  margin: var(--lume-space-6) 0;
  border: none;
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--lume-space-4) 0;
  font-size: 0.875em;
}

.lume-wysiwyg-pane__content :deep(th),
.lume-wysiwyg-pane__content :deep(td) {
  padding: var(--lume-space-2) var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  text-align: left;
}

.lume-wysiwyg-pane__content :deep(th) {
  background-color: var(--lume-bg-surface);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-wysiwyg-pane__content :deep(img) {
  max-width: 100%;
  border-radius: var(--lume-radius-md);
}
</style>
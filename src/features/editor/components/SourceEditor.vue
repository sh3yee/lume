<script setup lang="ts">
/**
 * SourceEditor - Markdown 源码编辑器
 *
 * 当前使用原生 textarea，后续可在保持 Document Store 边界不变的情况下替换为 CodeMirror 6。
 */
import { nextTick, onMounted, ref } from 'vue'
import { useDocument } from '../../documents/model/useDocument.ts'

const { content, updateCursor } = useDocument()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function syncCursor(element: HTMLTextAreaElement) {
  const lines = element.value.substring(0, element.selectionStart).split('\n')
  updateCursor(lines.length, lines[lines.length - 1].length + 1)
}

function handleInput(event: Event) {
  const element = event.target as HTMLTextAreaElement
  content.value = element.value
  syncCursor(element)
}

function handleKeydown(event: KeyboardEvent) {
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
}

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
    ></textarea>
  </section>
</template>

<style scoped>
.lume-source-editor { flex: 1; display: flex; min-width: 0; overflow: hidden; background-color: var(--lume-bg-surface); }
.lume-source-editor__textarea {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: var(--lume-space-8) var(--lume-space-10);
  border: none;
  outline: none;
  resize: none;
  background-color: transparent;
  color: var(--lume-text-primary);
  font-family: var(--lume-font-mono, 'Cascadia Code', 'Fira Code', Consolas, monospace);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
  letter-spacing: 0.2px;
  tab-size: 2;
  -moz-tab-size: 2;
}
.lume-source-editor__textarea::placeholder { color: var(--lume-text-tertiary); }
.lume-source-editor__textarea::selection { background-color: var(--lume-accent-subtle); }
.lume-source-editor__textarea::-webkit-scrollbar { width: 10px; height: 10px; }
.lume-source-editor__textarea::-webkit-scrollbar-track { background: transparent; }
.lume-source-editor__textarea::-webkit-scrollbar-thumb { border: 2px solid var(--lume-bg-surface); border-radius: var(--lume-radius-full); background-color: var(--lume-border-default); }
.lume-source-editor__textarea::-webkit-scrollbar-thumb:hover { background-color: var(--lume-border-strong); }
</style>
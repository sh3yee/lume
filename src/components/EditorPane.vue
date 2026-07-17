<script setup lang="ts">
/**
 * EditorPane - 编辑区
 *
 * 提供原生 textarea 编辑器，后续将替换为 CodeMirror 6 编辑内核。
 * 通过 useDocument composable 与预览区共享文档状态。
 */
import { ref, nextTick, onMounted } from 'vue'
import { useDocument } from '@composables/useDocument'

const { content, updateCursor } = useDocument()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

/** 处理输入事件，更新光标位置 */
function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  content.value = target.value
  syncCursor(target)
}

/** 同步光标行列位置 */
function syncCursor(el: HTMLTextAreaElement) {
  const value = el.value
  const pos = el.selectionStart
  const before = value.substring(0, pos)
  const lines = before.split('\n')
  updateCursor(lines.length, lines[lines.length - 1].length + 1)
}

/** 处理光标移动 */
function handleKeyup(e: Event) {
  const target = e.target as HTMLTextAreaElement
  syncCursor(target)
}

/** 处理点击选区 */
function handleClick(e: Event) {
  const target = e.target as HTMLTextAreaElement
  syncCursor(target)
}

/** 支持 Tab 缩进 */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target as HTMLTextAreaElement
    const start = el.selectionStart
    const end = el.selectionEnd
    const newValue = el.value.substring(0, start) + '  ' + el.value.substring(end)
    content.value = newValue
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + 2
      syncCursor(el)
    })
  }
}

onMounted(() => {
  if (textareaRef.value) {
    syncCursor(textareaRef.value)
  }
})
</script>

<template>
  <section class="lume-editor-pane">
    <textarea
      ref="textareaRef"
      class="lume-editor-pane__textarea"
      :value="content"
      spellcheck="false"
      placeholder="开始输入 Markdown..."
      @input="handleInput"
      @keyup="handleKeyup"
      @click="handleClick"
      @keydown="handleKeydown"
    ></textarea>
  </section>
</template>

<style scoped>
.lume-editor-pane {
  flex: 1;
  display: flex;
  background-color: var(--lume-bg-surface);
  overflow: hidden;
  min-width: 0;
}

.lume-editor-pane__textarea {
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

.lume-editor-pane__textarea::placeholder {
  color: var(--lume-text-tertiary);
}

.lume-editor-pane__textarea::selection {
  background-color: var(--lume-accent-subtle);
}

.lume-editor-pane__textarea::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.lume-editor-pane__textarea::-webkit-scrollbar-track {
  background: transparent;
}

.lume-editor-pane__textarea::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid var(--lume-bg-surface);
}

.lume-editor-pane__textarea::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}
</style>
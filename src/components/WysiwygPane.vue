<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { replaceAll } from '@milkdown/kit/utils'
import { useDocument } from '@composables/useDocument'

const { content, updateCursor } = useDocument()

const editorRef = ref<HTMLDivElement | null>(null)
let editor: Editor | null = null
let editorMarkdown = content.value

onMounted(async () => {
  if (!editorRef.value) return

  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value!)
      ctx.set(defaultValueCtx, content.value)

      ctx.get(listenerCtx)
        .markdownUpdated((_ctx, markdown) => {
          editorMarkdown = markdown
          if (content.value !== markdown) content.value = markdown
        })
        .selectionUpdated((_ctx, selection) => {
          const before = selection.$from.doc.textBetween(0, selection.from, '\n', '\n')
          const lines = before.split('\n')
          updateCursor(lines.length, (lines.at(-1)?.length || 0) + 1)
        })
    })
    .use(commonmark)
    .use(listener)
    .create()
})

/** 打开文件或新建文档时，将外部 Markdown 更新到 Milkdown。 */
watch(content, (markdown) => {
  if (!editor || markdown === editorMarkdown) return
  editorMarkdown = markdown
  editor.action(replaceAll(markdown))
})

onBeforeUnmount(() => {
  void editor?.destroy()
  editor = null
})
</script>

<template>
  <section class="lume-wysiwyg-pane">
    <div ref="editorRef" class="lume-wysiwyg-pane__content"></div>
  </section>
</template>

<style scoped>
.lume-wysiwyg-pane {
  flex: 1;
  display: flex;
  background-color: var(--lume-bg-surface-raised);
  overflow-x: hidden;
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
}

.lume-wysiwyg-pane__content {
  flex: 1;
    display: flex;
  width: 100%;
  min-height: 100%;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
}

/* 滚动条 */
.lume-wysiwyg-pane::-webkit-scrollbar {
  width: 10px;
}

.lume-wysiwyg-pane::-webkit-scrollbar-track {
  background: transparent;
}

.lume-wysiwyg-pane::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid var(--lume-bg-surface-raised);
}

.lume-wysiwyg-pane::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}

/* Milkdown 外层保持全宽，正文维持适合阅读的居中宽度。 */
.lume-wysiwyg-pane__content :deep(.milkdown) {
  box-sizing: border-box;
  flex: 1;
    display: flex;
  width: 100%;
  max-width: var(--lume-preview-max-width);
  min-height: 100%;
  margin: 0 auto;
  padding: var(--lume-space-8) var(--lume-space-10);
}

/* 移除 ProseMirror 默认焦点边框。 */
.lume-wysiwyg-pane__content :deep(.ProseMirror),
.lume-wysiwyg-pane__content :deep(.ProseMirror:focus),
.lume-wysiwyg-pane__content :deep(.ProseMirror-focused) {
  flex: 1;
    width: 100%;
  min-height: 100%;
  border: none;
  outline: none;
  box-shadow: none;
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
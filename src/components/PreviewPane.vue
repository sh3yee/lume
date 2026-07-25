<script setup lang="ts">
/**
 * PreviewPane - 预览区
 *
 * 使用 markdown-it 实时渲染编辑区的 Markdown 内容。
 * 后续将集成局部更新与滚动同步。
 */
import { useDocument } from '@composables/useDocument'
import { useMarkdownPreview } from '@/features/editor/preview/useMarkdownPreview.ts'

const { activeDocument, content } = useDocument()
const { renderedHtml } = useMarkdownPreview(content, activeDocument)
</script>

<template>
  <section class="lume-preview-pane">
   <div class="lume-preview-pane__content lume-markdown-content" v-html="renderedHtml"></div>
  </section>
</template>

<style scoped>
.lume-preview-pane {
  flex: 1;
  display: flex;
  background-color: var(--lume-bg-surface-raised);
  border-left: 1px solid var(--lume-border-subtle);
  overflow: hidden;
  min-width: 0;
}

.lume-preview-pane__content {
  flex: 1;
  max-width: var(--lume-preview-max-width);
  margin: 0 auto;
  padding: var(--lume-space-8) var(--lume-space-10);
  overflow-y: auto;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
}

/* 滚动条 */
.lume-preview-pane__content::-webkit-scrollbar {
  width: 10px;
}

.lume-preview-pane__content::-webkit-scrollbar-track {
  background: transparent;
}

.lume-preview-pane__content::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid var(--lume-bg-surface-raised);
}

.lume-preview-pane__content::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}

/* Markdown 元素样式 */
.lume-preview-pane__content :deep(h1) {
  font-size: 1.8em;
  font-weight: var(--lume-font-weight-bold);
  margin: var(--lume-space-8) 0 var(--lume-space-4);
  padding-bottom: var(--lume-space-2);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-preview-pane__content :deep(h2) {
  font-size: 1.4em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-7) 0 var(--lume-space-3);
  padding-bottom: var(--lume-space-1);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-preview-pane__content :deep(h3) {
  font-size: 1.2em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-6) 0 var(--lume-space-3);
}

.lume-preview-pane__content :deep(h4),
.lume-preview-pane__content :deep(h5),
.lume-preview-pane__content :deep(h6) {
  font-size: 1em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-5) 0 var(--lume-space-2);
}

.lume-preview-pane__content :deep(p) {
  margin: var(--lume-space-3) 0;
}

.lume-preview-pane__content :deep(a) {
  color: var(--lume-accent-default);
  text-decoration: none;
  transition: color var(--lume-transition-fast);
}

.lume-preview-pane__content :deep(a:hover) {
  color: var(--lume-accent-hover);
  text-decoration: underline;
}

.lume-preview-pane__content :deep(strong) {
  font-weight: var(--lume-font-weight-bold);
  color: var(--lume-text-primary);
}

.lume-preview-pane__content :deep(em) {
  font-style: italic;
}

.lume-preview-pane__content :deep(ul),
.lume-preview-pane__content :deep(ol) {
  padding-left: var(--lume-space-6);
  margin: var(--lume-space-3) 0;
}

.lume-preview-pane__content :deep(li) {
  margin: var(--lume-space-1) 0;
}

.lume-preview-pane__content :deep(blockquote) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-2) var(--lume-space-5);
  border-left: 3px solid var(--lume-accent-default);
  background-color: var(--lume-accent-subtle);
  border-radius: 0 var(--lume-radius-sm) var(--lume-radius-sm) 0;
  color: var(--lume-text-secondary);
}

.lume-preview-pane__content :deep(blockquote p) {
  margin: var(--lume-space-1) 0;
}

.lume-preview-pane__content :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 0.875em;
  padding: var(--lume-space-1) var(--lume-space-2);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-sm);
}

.lume-preview-pane__content :deep(pre) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-4) var(--lume-space-5);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-md);
  overflow-x: auto;
}

.lume-preview-pane__content :deep(pre code) {
  padding: 0;
  background: none;
  border: none;
  font-size: 0.875em;
  line-height: 1.6;
}

.lume-preview-pane__content :deep(hr) {
  margin: var(--lume-space-6) 0;
  border: none;
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-preview-pane__content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--lume-space-4) 0;
  font-size: 0.875em;
}

.lume-preview-pane__content :deep(th),
.lume-preview-pane__content :deep(td) {
  padding: var(--lume-space-2) var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  text-align: left;
}

.lume-preview-pane__content :deep(th) {
  background-color: var(--lume-bg-surface);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-preview-pane__content :deep(img) {
  max-width: 100%;
  margin-inline: var(--lume-space-3);
  border-radius: var(--lume-radius-md);
  vertical-align: text-bottom;
}

.lume-preview-pane__content :deep(img[style*='display: block']) {
  margin-block: var(--lume-space-3);
}
</style>

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

/* Preview 图片保留只读排版所需的额外间距。 */
.lume-preview-pane__content :deep(img) {
  margin-inline: var(--lume-space-3);
}

.lume-preview-pane__content :deep(img[style*='display: block']) {
  margin-block: var(--lume-space-3);
}
</style>

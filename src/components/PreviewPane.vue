<script setup lang="ts">
/**
 * PreviewPane - 预览区
 *
 * 使用 markdown-it 实时渲染编辑区的 Markdown 内容，并支持与源码编辑区同步滚动。
 */
import { t } from '@/app/i18n'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useDocument } from '@composables/useDocument'
import { useMarkdownPreview } from '@/features/editor/preview/useMarkdownPreview.ts'
import { usePreviewInteractions } from '@/features/editor/preview/usePreviewInteractions'
import SelectionToolbar from '@/features/editor/overlays/SelectionToolbar.vue'
import { openEditorLink } from '@/features/editor/wysiwyg/editorLinks'

const props = defineProps<{
  syncRatio?: number
}>()

const emit = defineEmits<{
  (e: 'scroll-ratio', value: number): void
}>()

const { activeDocument, content, openDocument } = useDocument()
const { enhancePreview, renderedHtml } = useMarkdownPreview(content, activeDocument)
const previewContentRef = ref<HTMLElement | null>(null)
const previewToolbarRef = ref<{
  getBounds: () => DOMRect | null
  focusFirstItem: () => void
} | null>(null)
const interactionError = ref('')
let isApplyingScrollSync = false

const {
  toolbar: previewToolbar,
  handleAction,
  dismiss,
  refresh: refreshPreviewToolbar,
} = usePreviewInteractions({
  getRoot: () => previewContentRef.value,
  getToolbar: () => previewToolbarRef.value,
  getHtml: () => renderedHtml.value,
  getDocumentId: () => activeDocument.value?.id,
  onError: (message) => {
    interactionError.value = message
  },
  onOpenLink: (href) => {
    const document = activeDocument.value
    return openEditorLink(href, {
      documentPath: document?.path ?? null,
      root: previewContentRef.value,
      isActive: () =>
        Boolean(previewContentRef.value?.isConnected) && activeDocument.value?.id === document?.id,
      onOpenDocument: openDocument,
    })
  },
})

async function renderPreviewExtensions() {
  await nextTick()
  if (previewContentRef.value) await enhancePreview(previewContentRef.value)
  refreshPreviewToolbar()
}

function handleScroll(event: Event) {
  const element = event.target as HTMLElement
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
  const ratio = maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0
  if (!isApplyingScrollSync) emit('scroll-ratio', ratio)
}

watch(renderedHtml, () => void renderPreviewExtensions())

watch(
  () => props.syncRatio,
  (ratio) => {
    const element = previewContentRef.value
    if (!element || typeof ratio !== 'number' || !Number.isFinite(ratio)) return
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    isApplyingScrollSync = true
    element.scrollTop = ratio * maxScrollTop
    requestAnimationFrame(() => {
      isApplyingScrollSync = false
    })
  },
)

onMounted(() => void renderPreviewExtensions())
</script>

<template>
  <section class="lume-preview-pane">
    <div v-if="interactionError" class="lume-preview-pane__error" role="alert">
      {{ interactionError }}
      <button type="button" @click="interactionError = ''">{{ t('关闭') }}</button>
    </div>
    <div
      ref="previewContentRef"
      class="lume-preview-pane__content lume-markdown-content"
      @scroll="handleScroll"
      v-html="renderedHtml"
    ></div>
  </section>
  <Teleport to="body">
    <SelectionToolbar
      v-if="previewToolbar"
      ref="previewToolbarRef"
      :model="previewToolbar.model"
      :position="previewToolbar.position"
      :revision="previewToolbar.revision"
      :overlay-id="`preview-${activeDocument?.id ?? ''}`"
      @action="handleAction"
      @dismiss="dismiss"
    />
  </Teleport>
</template>

<style scoped>
.lume-preview-pane {
  position: relative;
  flex: 1;
  display: flex;
  background-color: var(--lume-pane-bg);
  border: 1px solid var(--lume-panel-border);
  border-radius: var(--lume-radius-lg);
  box-shadow: var(--lume-shadow-xs);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
.lume-preview-pane__error {
  position: absolute;
  z-index: 1;
  top: 8px;
  left: 8px;
  right: 8px;
  padding: 8px;
  background: var(--lume-bg-overlay);
  color: var(--lume-text-primary);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-sm);
}
.lume-preview-pane__content {
  flex: 1;
  min-width: 0;
  max-width: var(--lume-preview-max-width);
  margin: 0 auto;
  padding: var(--lume-space-7) clamp(24px, 2.6vw, 40px);
  overflow-y: auto;
  color: var(--lume-text-primary);
  font-family: var(--lume-writing-font, var(--lume-font-serif));
  font-size: var(--lume-writing-font-size, var(--lume-font-size-md));
  line-height: var(--lume-writing-line-height, 1.65);
}

/* 滚动条 */
.lume-preview-pane__content::-webkit-scrollbar {
  width: 8px;
}

.lume-preview-pane__content::-webkit-scrollbar-track {
  background: transparent;
}

.lume-preview-pane__content::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.lume-preview-pane__content::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}

/* 仅独占一段的图片自动居中，行内图片跟随文字排版。 */
.lume-preview-pane__content :deep(img.lume-image-standalone) {
  display: block;
  margin-inline: auto;
}

.lume-preview-pane__content :deep(img[style*='display: block']) {
  margin-block: var(--lume-space-3);
}
</style>

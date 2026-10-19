<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editorViewCtx, parserCtx, serializerCtx, type Editor } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useDocument } from '@composables/useDocument'
import { WELCOME_DOCUMENT_CONTENT } from '@/features/documents/model/documentStore'
import { constrainOverlayPosition } from '@/features/editor/overlays/overlayPosition.ts'
import FindReplaceWidget from '@/features/editor/overlays/FindReplaceWidget.vue'
import EditorContextMenu from '@/features/editor/overlays/EditorContextMenu.vue'
import NodePropertiesDialog from '@/features/editor/overlays/NodePropertiesDialog.vue'
import SelectionToolbar from '@/features/editor/overlays/SelectionToolbar.vue'
import { useSelectionToolbar } from '@/features/editor/wysiwyg/useSelectionToolbar'
import { createEditorCommands } from '@/features/editor/wysiwyg/editorCommands'
import { useEditorContextMenu } from '@/features/editor/wysiwyg/useEditorContextMenu'
import { openEditorLink } from '@/features/editor/wysiwyg/editorLinks'
import {
  createWysiwygEditor,
  destroyWysiwygEditor,
  replaceEditorMarkdown,
  getPendingEditorMarkdown,
} from '@/features/editor/wysiwyg/editorLifecycle'
import { insertNativeImagePaths } from '@/features/editor/extensions/images'
import { useFindReplace } from '@/features/editor/wysiwyg/useFindReplace'
import {
  importEditorImageFile,
  importEditorImagePath,
  resolveEditorImageSource,
} from '@/features/images/editor/imageEditorAssets'

interface NativeImageDropDetail {
  paths: string[]
  x: number
  y: number
}

const emit = defineEmits<{ editSource: [] }>()

const {
  activeDocument,
  content,
  documents,
  persistDocumentSession,
  updateDocumentContent,
  updateDocumentCursor,
  restoreWelcomeDocumentBaseline,
  openDocument,
} = useDocument()
const boundDocumentId = activeDocument.value?.id ?? null
const overlayId = boundDocumentId ?? 'lume-editor'

const editorRef = ref<HTMLDivElement | null>(null)
const findReplaceWidget = ref<{ focus: (select?: boolean) => void } | null>(null)
const contextMenu = ref<{
  focusFirstItem: () => void
  getBounds: () => DOMRect | null
} | null>(null)
const contextMenuPosition = ref({ x: 0, y: 0 })
const commandError = ref('')
const selectionToolbarRef = ref<{
  getElement: () => HTMLElement | null
  getBounds: () => DOMRect | null
  focusFirstItem: () => void
} | null>(null)
let editor: Editor | null = null
let disposed = false
let editorMarkdown = content.value
let synchronizedDoc: ProseNode | null = null
let sourceDocument: { doc: ProseNode; markdown: string } | null = null
const {
  context: menuContext,
  groups: contextMenuGroups,
  propertyForm,
  close: closeMenuTarget,
  closeProperties,
  prepareCommand,
  open: openMenuTarget,
  invalidate: invalidateMenuTarget,
  handleAction: handleContextAction,
  submitProperties,
  actions,
} = useEditorContextMenu({
  getEditor: () => editor,
  getCommands: () => editorCommands,
  isActive: () => !disposed && activeDocument.value?.id === boundDocumentId,
  onError: (message) => {
    commandError.value = message
  },
  onEditSource: () => {
    flushPendingMarkdown()
    emit('editSource')
  },
  onAfterAction: (view) => selectionControls.schedule(view),
  onOpenLink: (href) =>
    openEditorLink(href, {
      documentPath: activeDocument.value?.path ?? null,
      root: editorRef.value,
      isActive: () => !disposed && activeDocument.value?.id === boundDocumentId,
      onOpenDocument: openDocument,
    }),
})
const contextMenuOpen = computed(() => menuContext.value !== null)

const editorCommands = createEditorCommands({
  getEditor: () => editor,
  onBeforeCommand: prepareCommand,
  onCopy: () => {},
  onError: (message) => {
    commandError.value = message
  },
  isActive: () => !disposed && activeDocument.value?.id === boundDocumentId,
  onImageAlign(view) {
    selectionControls.schedule(view)
  },
})

const {
  activeFindMatchIndex,
  closeFindReplace,
  findMatches,
  findReplaceOpen,
  handleFindQueryInput,
  moveFindMatch,
  openFindReplace,
  replaceAllMatches,
  replaceCurrentMatch,
  syncFindMatches,
} = useFindReplace({
  closeOverlays() {
    closeContextMenu()
    selectionControls.dismiss()
  },
  focusWidget: (select) => findReplaceWidget.value?.focus(select),
  getEditor: () => editor,
})

const selectionControls = useSelectionToolbar({
  getRoot: () => editorRef.value,
  getToolbar: () => selectionToolbarRef.value,
  overlayId,
  isActive: () => !disposed && activeDocument.value?.id === boundDocumentId,
  isSuspended: () => Boolean(menuContext.value || propertyForm.value || findReplaceOpen.value),
  onAction: (id, target) => actions.execute(id, target),
  onCloseMenus: () => closeContextMenu(),
})
const { toolbar: selectionToolbar } = selectionControls

const synchronizeMarkdown = (markdown: string, view: EditorView | null) => {
  if (disposed) return
  // 撤销回加载时的文档结构后恢复原文，避免序列化格式差异被当作未保存修改。
  const nextMarkdown =
    sourceDocument && view?.state.doc.eq(sourceDocument.doc) ? sourceDocument.markdown : markdown
  if (view) synchronizedDoc = view.state.doc
  if (view) invalidateMenuTarget(view)
  editorMarkdown = nextMarkdown
  if (boundDocumentId && updateDocumentContent(boundDocumentId, nextMarkdown)) {
    persistDocumentSession()
  }
  if (findReplaceOpen.value && view) syncFindMatches(view)
}

const flushPendingMarkdown = () => {
  const markdown = getPendingEditorMarkdown(editor, synchronizedDoc)
  if (markdown === null) return
  editor?.action((ctx) => synchronizeMarkdown(markdown, ctx.get(editorViewCtx)))
}

defineExpose({ flushPendingMarkdown })

function closeContextMenu() {
  closeMenuTarget()
}

async function openContextMenu(event: MouseEvent) {
  if (!editor) return
  commandError.value = ''
  openMenuTarget(event)

  contextMenuPosition.value = constrainOverlayPosition(
    { x: event.clientX, y: event.clientY },
    { width: 216, height: 0 },
  )
  selectionControls.hide()
  await nextTick()

  const menuBounds = contextMenu.value?.getBounds()
  if (!menuBounds) return

  // 菜单项会随选区状态变化，必须渲染后按真实尺寸约束到窗口内。
  contextMenuPosition.value = constrainOverlayPosition(
    { x: event.clientX, y: event.clientY },
    { width: menuBounds.width, height: menuBounds.height },
  )
  await nextTick()
  contextMenu.value?.focusFirstItem()
}

function handleWindowPointerDown() {
  closeContextMenu()
}

function handleWindowResize() {
  closeContextMenu()
  selectionControls.schedule()
}

function handleWindowKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openFindReplace(true)
    return
  }

  if (event.key !== 'Escape') return
  if (findReplaceOpen.value) {
    event.preventDefault()
    closeFindReplace()
    return
  }
  closeContextMenu()
  selectionControls.hide()
}

function handleNativeImageDrop(event: Event) {
  const detail = (event as CustomEvent<NativeImageDropDetail>).detail
  if (!detail?.paths.length) return
  editor?.action((ctx) => {
    const documentId = activeDocument.value?.id
    const documentPath = activeDocument.value?.path ?? null
    if (!documentId) return
    void insertNativeImagePaths(ctx.get(editorViewCtx), detail, {
      importPath: (path) => importEditorImagePath(path, documentPath, documentId),
      isActive: () => activeDocument.value?.id === documentId,
    })
  })
}

onMounted(async () => {
  if (!editorRef.value) return

  editor = await createWysiwygEditor({
    root: editorRef.value,
    initialMarkdown: content.value,
    async importImageFile(file) {
      const documentId = activeDocument.value?.id
      if (!documentId) return null
      return importEditorImageFile(file, activeDocument.value?.path ?? null, documentId)
    },
    isDocumentActive: () => activeDocument.value?.id === boundDocumentId,
    onImageSelect: (view) => selectionControls.schedule(view),
    onViewUpdate(view) {
      if (!synchronizedDoc) {
        synchronizedDoc = view.state.doc
        sourceDocument = { doc: view.state.doc, markdown: editorMarkdown }
      }
      invalidateMenuTarget(view)
      selectionControls.schedule(view)
    },
    onAction: (id, target) => actions.execute(id, target),
    onMarkdownChange: synchronizeMarkdown,
    onSelectionChange(view, line, column) {
      if (view) invalidateMenuTarget(view)
      if (boundDocumentId) updateDocumentCursor(boundDocumentId, line, column)
    },
    resolveImageSource(src) {
      return resolveEditorImageSource(
        src,
        activeDocument.value?.path ?? null,
        activeDocument.value?.id ?? '',
      )
    },
  })

  if (disposed) {
    await destroyWysiwygEditor(editor)
    editor = null
    return
  }
  if (
    boundDocumentId &&
    activeDocument.value?.id === boundDocumentId &&
    documents.value.some((document) => document.path === null && document.isDirty)
  ) {
    const normalizedWelcomeContent = editor.action((ctx) => {
      const welcomeDoc = ctx.get(parserCtx)(WELCOME_DOCUMENT_CONTENT)
      return welcomeDoc ? ctx.get(serializerCtx)(welcomeDoc) : WELCOME_DOCUMENT_CONTENT
    })
    let restoredWelcomeDocument = false
    for (const document of documents.value) {
      if (restoreWelcomeDocumentBaseline(document.id, normalizedWelcomeContent)) {
        restoredWelcomeDocument = true
      }
    }
    if (restoredWelcomeDocument) persistDocumentSession()
  }
  if (activeDocument.value?.id === boundDocumentId && content.value !== editorMarkdown) {
    editorMarkdown = content.value
    synchronizedDoc = null
    sourceDocument = null
    replaceEditorMarkdown(editor, content.value)
  }

  window.addEventListener('pointerdown', handleWindowPointerDown)
  window.addEventListener('blur', handleWindowResize)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('lume:image-drop', handleNativeImageDrop)
})

/** 打开文件或新建文档时，将外部 Markdown 更新到 Milkdown。 */
watch(
  () => activeDocument.value?.id,
  () => {
    closeContextMenu()
    closeProperties()
    selectionControls.dismiss()
  },
)

watch(content, (markdown) => {
  if (!editor || activeDocument.value?.id !== boundDocumentId || markdown === editorMarkdown) return
  editorMarkdown = markdown
  synchronizedDoc = null
  sourceDocument = null
  closeContextMenu()
  closeProperties()
  selectionControls.dismiss()
  replaceEditorMarkdown(editor, markdown)
})

onBeforeUnmount(() => {
  // 模式或标签切换时，补齐 Milkdown 防抖回调尚未写入 Store 的编辑。
  flushPendingMarkdown()
  disposed = true
  closeContextMenu()
  closeProperties()
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  window.removeEventListener('blur', handleWindowResize)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('lume:image-drop', handleNativeImageDrop)
  void destroyWysiwygEditor(editor)
  editor = null
})
</script>

<template>
  <section class="lume-wysiwyg-pane">
    <div v-if="commandError" class="lume-wysiwyg-pane__error" role="alert">
      {{ commandError }} <button type="button" @click="commandError = ''">关闭</button>
    </div>
    <div
      ref="editorRef"
      class="lume-wysiwyg-pane__content lume-markdown-content"
      @contextmenu.prevent="openContextMenu"
    ></div>

    <FindReplaceWidget
      v-show="findReplaceOpen"
      ref="findReplaceWidget"
      :active-index="activeFindMatchIndex"
      :match-count="findMatches.length"
      @close="closeFindReplace"
      @find="handleFindQueryInput"
      @move="moveFindMatch"
      @replace="replaceCurrentMatch"
      @replace-all="replaceAllMatches"
    />
  </section>

  <Teleport to="body">
    <SelectionToolbar
      v-if="selectionToolbar"
      ref="selectionToolbarRef"
      :model="selectionToolbar.model"
      :position="selectionToolbar.position"
      :revision="selectionToolbar.revision"
      :overlay-id="overlayId"
      @action="selectionControls.handleAction"
      @dismiss="selectionControls.dismiss(true)"
    />

    <EditorContextMenu
      v-if="contextMenuOpen"
      ref="contextMenu"
      :groups="contextMenuGroups"
      :overlay-id="overlayId"
      :position="contextMenuPosition"
      @action="handleContextAction"
      @close="closeContextMenu"
    />
    <NodePropertiesDialog
      v-if="propertyForm"
      :form="propertyForm"
      @close="closeProperties"
      @submit="submitProperties"
    />
  </Teleport>
</template>

<style scoped>
.lume-wysiwyg-pane__error {
  position: absolute;
  z-index: 1;
  top: var(--lume-space-3);
  left: var(--lume-space-3);
  right: var(--lume-space-3);
  padding: var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-sm);
  background: var(--lume-bg-overlay);
  color: var(--lume-text-primary);
}
.lume-wysiwyg-pane__error button {
  float: right;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.lume-wysiwyg-pane {
  position: relative;
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
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
}

/* 独立占位区会真实增加滚动高度，不会被编辑器的 Flex 高度计算抵消。 */
.lume-wysiwyg-pane__content::after {
  content: '';
  flex: 0 0 max(var(--lume-space-10), 5vh);
  width: 100%;
  pointer-events: none;
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
  flex: 0 0 auto;
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
  box-sizing: border-box;
  flex: 1;
  width: 100%;
  min-height: 100%;
  border: none;
  outline: none;
  box-shadow: none;
}
/* WYSIWYG 编辑态保留换行、表格选区与 NodeView 专用样式。 */
.lume-wysiwyg-pane__content :deep(p) {
  white-space: pre-wrap;
}

.lume-wysiwyg-pane__content :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.lume-wysiwyg-pane__content :deep(th),
.lume-wysiwyg-pane__content :deep(td) {
  position: relative;
  min-width: 112px;
}

.lume-wysiwyg-pane__content :deep(.selectedCell::after) {
  content: '';
  position: absolute;
  inset: 0;
  background-color: color-mix(in srgb, var(--lume-accent-default) 14%, transparent);
  pointer-events: none;
}
.lume-wysiwyg-pane__content :deep(.lume-image-resizer) {
  position: relative;
  display: inline-block;
  box-sizing: border-box;
  max-width: 100%;
  margin: 0 var(--lume-space-3);
  line-height: 0;
  vertical-align: text-bottom;
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer img) {
  width: 100%;
  height: auto;
  margin: 0;
  user-select: none;
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer[data-align='center']) {
  display: block;
  margin-right: auto;
  margin-left: auto;
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer[data-align='right']) {
  display: block;
  margin-right: 0;
  margin-left: auto;
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer.ProseMirror-selectednode) {
  outline: none;
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer.ProseMirror-selectednode img) {
  box-shadow: 0 0 0 2px var(--lume-accent-default);
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer + .ProseMirror-separator) {
  display: inline-block;
  width: var(--lume-space-2);
}

.lume-wysiwyg-pane__content :deep(.lume-image-resizer__handle) {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--lume-bg-surface-raised);
  border-radius: 3px;
  background-color: var(--lume-accent-default);
  box-shadow: var(--lume-shadow-sm);
  cursor: nwse-resize;
  opacity: 0;
  pointer-events: none;
}

.lume-wysiwyg-pane__content
  :deep(.ProseMirror[contenteditable='false'] .lume-image-resizer__handle) {
  display: none;
}

.lume-wysiwyg-pane__content
  :deep(.lume-image-resizer.ProseMirror-selectednode .lume-image-resizer__handle) {
  opacity: 1;
  pointer-events: auto;
}

.lume-wysiwyg-pane__content :deep(.lume-search-match) {
  background-color: color-mix(in srgb, var(--lume-accent-default) 24%, transparent);
  border-radius: 2px;
}

.lume-wysiwyg-pane__content :deep(.lume-search-match--active) {
  background-color: color-mix(in srgb, var(--lume-accent-default) 48%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lume-accent-default) 70%, transparent);
}
</style>

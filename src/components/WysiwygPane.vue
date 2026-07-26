<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useDocument } from '@composables/useDocument'
import {
  importImageFile,
  isTauri,
  resolveImagePath,
  storeClipboardImage,
} from '../types/tauri'
import {
  type ImageAlign,
} from '../utils/imageHtml'
import {
  constrainOverlayPosition,
  positionOverlayAroundBounds,
} from '@/features/editor/overlays/overlayPosition.ts'
import FindReplaceWidget from '@/features/editor/overlays/FindReplaceWidget.vue'
import EditorContextMenu from '@/features/editor/overlays/EditorContextMenu.vue'
import ImageToolbar from '@/features/editor/overlays/ImageToolbar.vue'
import TextSelectionToolbar from '@/features/editor/overlays/TextSelectionToolbar.vue'
import {
  createEditorCommands,
  getConvertibleBlockPosition,
} from '@/features/editor/wysiwyg/editorCommands'
import {
  createWysiwygEditor,
  destroyWysiwygEditor,
  replaceEditorMarkdown,
} from '@/features/editor/wysiwyg/editorLifecycle'
import { insertNativeImagePaths } from '@/features/editor/wysiwyg/imageInput'
import {
  findTextMatches,
  updateSearchHighlight,
  type SearchMatch,
} from '@/features/editor/wysiwyg/searchHighlight'

const {
  activeDocument,
  content,
  persistDocumentSession,
  updateDocumentContent,
  updateDocumentCursor,
} = useDocument()
const boundDocumentId = activeDocument.value?.id ?? null

const editorRef = ref<HTMLDivElement | null>(null)
const findReplaceWidget = ref<{ focus: (select?: boolean) => void } | null>(null)
const contextMenu = ref<{
  focusFirstItem: () => void
  getBounds: () => DOMRect | null
} | null>(null)
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const selectionHasText = ref(false)
const selectionInCodeBlock = ref(false)
const contextBlockCanConvertToParagraph = ref(false)
const bubbleToolbarOpen = ref(false)
const bubbleToolbarPosition = ref({ x: 0, y: 0 })
const imageToolbarOpen = ref(false)
const imageToolbarPosition = ref({ x: 0, y: 0 })
const selectedImageAlign = ref<ImageAlign>('left')
const findReplaceOpen = ref(false)
let activeFindQuery = ''
const findMatches = ref<SearchMatch[]>([])
const activeFindMatchIndex = ref(-1)
let editor: Editor | null = null
let editorMarkdown = content.value
// 记录指针按下位置，用于区分普通单击和拖动选择。
let pointerDownPosition: { x: number; y: number } | null = null
let collapseSelectionFrame = 0
// 指针事件处理期间禁止选区更新重新打开浮动工具栏，避免关闭时闪烁。
let bubbleToolbarSuppressed = false

interface NativeImageDropDetail {
  paths: string[]
  x: number
  y: number
}

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function updateSearchPlugin(view: EditorView, matches = findMatches.value, activeIndex = activeFindMatchIndex.value) {
  updateSearchHighlight(view, matches, activeIndex)
}

function closeContextMenu() {
  contextMenuOpen.value = false
}

function closeBubbleToolbar() {
  bubbleToolbarOpen.value = false
}

function closeImageToolbar() {
  imageToolbarOpen.value = false
}

function updateSelectedImageToolbar(view: EditorView, selection: NodeSelection) {
  if (selection.node.type.name !== 'image' || contextMenuOpen.value || !view.hasFocus()) {
    closeImageToolbar()
    return
  }

  const imageElement = view.nodeDOM(selection.from) as HTMLElement | null
  if (!imageElement) {
    closeImageToolbar()
    return
  }

  const bounds = imageElement.getBoundingClientRect()
  imageToolbarPosition.value = positionOverlayAroundBounds(bounds, { width: 90, height: 34 })
  selectedImageAlign.value = selection.node.attrs.align === 'center' || selection.node.attrs.align === 'right'
    ? selection.node.attrs.align
    : 'left'
  imageToolbarOpen.value = true
  closeBubbleToolbar()
}

function updateBubbleToolbar(view: EditorView | null | undefined) {
  const selection = view?.state?.selection
  if (!view || !selection) {
    closeBubbleToolbar()
    closeImageToolbar()
    return
  }

  if (bubbleToolbarSuppressed) {
    closeBubbleToolbar()
    return
  }

  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    updateSelectedImageToolbar(view, selection)
    return
  }
  closeImageToolbar()

  const { from, to } = selection
  const hasText = getSelectionHasText(view)
  if (!hasText || contextMenuOpen.value || !view.hasFocus()) {
    closeBubbleToolbar()
    return
  }

  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  const selectionLeft = Math.min(start.left, end.left)
  const selectionRight = Math.max(start.right, end.right)
  bubbleToolbarPosition.value = positionOverlayAroundBounds({
    top: Math.min(start.top, end.top),
    right: selectionRight,
    bottom: Math.max(start.bottom, end.bottom),
    left: selectionLeft,
  }, { width: selectionTouchesCodeBlock(view.state) ? 34 : 184, height: 34 })
  selectionInCodeBlock.value = selectionTouchesCodeBlock(view.state)
  bubbleToolbarOpen.value = true
}

function getSelectionHasText(view: EditorView) {
  const selection = view.state?.selection
  if (!selection) return false
  const { from, to, empty } = selection
  return !empty && view.state.doc.textBetween(from, to, '\n', '\n').trim().length > 0
}

function selectionTouchesCodeBlock(state: EditorState) {
  const { from, to } = state.selection
  let touchesCodeBlock = false

  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'code_block') touchesCodeBlock = true
    return !touchesCodeBlock
  })

  return touchesCodeBlock
}

async function openContextMenu(event: MouseEvent) {
  if (!editor) return
  const menuWidth = 192

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })

    if (pos && view.state.selection.empty) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos.pos))))
    }

    view.focus()
    selectionHasText.value = getSelectionHasText(view)
    selectionInCodeBlock.value = selectionTouchesCodeBlock(view.state)
    contextBlockCanConvertToParagraph.value = getConvertibleBlockPosition(view.state) !== null
  })

  contextMenuPosition.value = constrainOverlayPosition(
    { x: event.clientX, y: event.clientY },
    { width: menuWidth, height: 0 },
  )
  closeBubbleToolbar()
  contextMenuOpen.value = true
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

const editorCommands = createEditorCommands({
  getEditor: () => editor,
  onBeforeCommand: closeContextMenu,
  onCopy: closeBubbleToolbar,
  onImageAlign(view, align) {
    selectedImageAlign.value = align
    requestAnimationFrame(() => {
      const nextSelection = view.state.selection
      if (nextSelection instanceof NodeSelection) updateSelectedImageToolbar(view, nextSelection)
    })
  },
})

function syncFindMatches(view: EditorView, query = activeFindQuery, preferredIndex = activeFindMatchIndex.value) {
  activeFindQuery = query
  const matches = findTextMatches(view.state.doc, query)
  const activeIndex = matches.length === 0 ? -1 : Math.max(0, Math.min(preferredIndex, matches.length - 1))
  findMatches.value = matches
  activeFindMatchIndex.value = activeIndex
  updateSearchPlugin(view, matches, activeIndex)
  return { activeIndex, matches }
}

function openFindReplace(select = true) {
  findReplaceOpen.value = true
  closeContextMenu()
  closeBubbleToolbar()
  closeImageToolbar()
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    syncFindMatches(view)
  })
  void nextTick(() => findReplaceWidget.value?.focus(select))
}

function closeFindReplace() {
  findReplaceOpen.value = false
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    findMatches.value = []
    activeFindMatchIndex.value = -1
    updateSearchPlugin(view, [], -1)
    view.focus()
  })
}

function selectFindMatch(view: EditorView, index: number) {
  const match = findMatches.value[index]
  if (!match) return
  activeFindMatchIndex.value = index
  updateSearchPlugin(view, findMatches.value, index)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView())
}

function moveFindMatch(direction: 1 | -1, query = activeFindQuery) {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches } = syncFindMatches(view, query)
    if (matches.length === 0) return
    const nextIndex = (activeFindMatchIndex.value + direction + matches.length) % matches.length
    selectFindMatch(view, nextIndex)
    view.focus()
  })
}

function handleFindQueryInput(query: string) {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { activeIndex } = syncFindMatches(view, query, 0)
    if (activeIndex >= 0) selectFindMatch(view, activeIndex)
  })
}

function replaceCurrentMatch(query: string, replacement: string) {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches, activeIndex } = syncFindMatches(view, query)
    const match = matches[activeIndex]
    if (!match) return
    const tr = view.state.tr.insertText(replacement, match.from, match.to)
    view.dispatch(tr.scrollIntoView())
    const nextMatches = findTextMatches(view.state.doc, query)
    const nextIndex = nextMatches.length === 0 ? -1 : Math.min(activeIndex, nextMatches.length - 1)
    findMatches.value = nextMatches
    activeFindMatchIndex.value = nextIndex
    updateSearchPlugin(view, nextMatches, nextIndex)
    if (nextIndex >= 0) selectFindMatch(view, nextIndex)
  })
}

function replaceAllMatches(query: string, replacement: string) {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches } = syncFindMatches(view, query)
    if (matches.length === 0) return
    const tr = matches.reduceRight(
      (transaction, match) => transaction.insertText(replacement, match.from, match.to),
      view.state.tr,
    )
    view.dispatch(tr.scrollIntoView())
    findMatches.value = []
    activeFindMatchIndex.value = -1
    updateSearchPlugin(view, [], -1)
  })
}

function handleWindowPointerDown(event: PointerEvent) {
  // 新操作开始时立即关闭工具栏，并取消上一次尚未执行的选区折叠任务。
  cancelAnimationFrame(collapseSelectionFrame)
  collapseSelectionFrame = 0
  pointerDownPosition = event.button === 0
    ? { x: event.clientX, y: event.clientY }
    : null
  bubbleToolbarSuppressed = event.button === 0
  closeContextMenu()
  closeBubbleToolbar()
  closeImageToolbar()
}

function handleWindowPointerUp(event: PointerEvent) {
  const start = pointerDownPosition
  pointerDownPosition = null
  if (!start || event.button !== 0) {
    bubbleToolbarSuppressed = false
    return
  }

  const target = event.target
  const isEditorTarget = target instanceof Node && editorRef.value?.contains(target)
  const isDragSelection = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4

  if (!isEditorTarget) {
    bubbleToolbarSuppressed = false
    return
  }

  const pointerPosition = { x: event.clientX, y: event.clientY }
  // 等待 ProseMirror 完成本次指针事件，再根据最终选区决定显示或折叠。
  collapseSelectionFrame = requestAnimationFrame(() => {
    collapseSelectionFrame = 0
    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx)

      // 拖选结束后恢复正常同步，由最终文本选区决定是否显示工具栏。
      if (isDragSelection) {
        bubbleToolbarSuppressed = false
        updateBubbleToolbar(view)
        return
      }

      const selection = view.state.selection
      if (!(selection instanceof TextSelection) || selection.empty) {
        bubbleToolbarSuppressed = false
        closeBubbleToolbar()
        return
      }

      const position = view.posAtCoords({ left: pointerPosition.x, top: pointerPosition.y })
      const cursorPosition = position?.pos ?? view.state.doc.content.size
      // 普通单击应折叠旧选区，防止遗留选区再次触发浮动工具栏。
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(cursorPosition))))
      bubbleToolbarSuppressed = false
      closeBubbleToolbar()
    })

    if (!editor) bubbleToolbarSuppressed = false
  })
}

function handleWindowResize() {
  closeContextMenu()
  closeBubbleToolbar()
  closeImageToolbar()
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
  closeBubbleToolbar()
  closeImageToolbar()
}

function handleNativeImageDrop(event: Event) {
  const detail = (event as CustomEvent<NativeImageDropDetail>).detail
  if (!detail?.paths.length) return
  editor?.action((ctx) => {
    const documentId = activeDocument.value?.id
    const documentPath = activeDocument.value?.path ?? null
    if (!documentId) return
    void insertNativeImagePaths(ctx.get(editorViewCtx), detail, {
      importPath: async (path) => (await importImageFile(path, documentPath, documentId)).markdownPath,
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
      const extension = IMAGE_MIME_EXTENSIONS[file.type]
      if (!documentId || !extension) return null
      if (!isTauri()) return fileToDataUrl(file)
      return (await storeClipboardImage(
        Array.from(new Uint8Array(await file.arrayBuffer())),
        extension,
        activeDocument.value?.path ?? null,
        documentId,
      )).markdownPath
    },
    isDocumentActive: () => activeDocument.value?.id === boundDocumentId,
    onImageSelect: updateSelectedImageToolbar,
    onMarkdownChange(markdown, view) {
      editorMarkdown = markdown
      if (boundDocumentId && updateDocumentContent(boundDocumentId, markdown)) {
        persistDocumentSession()
      }
      if (findReplaceOpen.value && view) syncFindMatches(view)
    },
    onSelectionChange(view, line, column) {
      if (boundDocumentId) updateDocumentCursor(boundDocumentId, line, column)
      updateBubbleToolbar(view)
    },
    resolveImageSource(src) {
      if (!src || REMOTE_IMAGE_PATTERN.test(src) || !isTauri()) return src
      return resolveImagePath(
        src,
        activeDocument.value?.path ?? null,
        activeDocument.value?.id ?? '',
      ).then(convertFileSrc)
    },
  })

  window.addEventListener('pointerdown', handleWindowPointerDown)
  window.addEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('blur', handleWindowResize)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('lume:image-drop', handleNativeImageDrop)
})

/** 打开文件或新建文档时，将外部 Markdown 更新到 Milkdown。 */
watch(content, (markdown) => {
  if (!editor || activeDocument.value?.id !== boundDocumentId || markdown === editorMarkdown) return
  editorMarkdown = markdown
  replaceEditorMarkdown(editor, markdown)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(collapseSelectionFrame)
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  window.removeEventListener('pointerup', handleWindowPointerUp)
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
   <div ref="editorRef" class="lume-wysiwyg-pane__content lume-markdown-content"
      @contextmenu.prevent="openContextMenu"></div>

  <FindReplaceWidget v-show="findReplaceOpen" ref="findReplaceWidget" :active-index="activeFindMatchIndex"
      :match-count="findMatches.length" @close="closeFindReplace" @find="handleFindQueryInput" @move="moveFindMatch"
      @replace="replaceCurrentMatch" @replace-all="replaceAllMatches" />
  </section>

  <Teleport to="body">
   <TextSelectionToolbar
      v-if="bubbleToolbarOpen"
:in-code-block="selectionInCodeBlock"
     :position="bubbleToolbarPosition" @clear-formatting="editorCommands.clearInlineFormatting"
      @copy="editorCommands.copy" @toggle-bold="editorCommands.toggleBold"
      @toggle-inline-code="editorCommands.toggleInlineCode" @toggle-italic="editorCommands.toggleItalic" />

  <ImageToolbar
      v-if="imageToolbarOpen"
:align="selectedImageAlign" :position="imageToolbarPosition"
     @align="editorCommands.setImageAlign" />

  <EditorContextMenu
      v-if="contextMenuOpen"
      ref="contextMenu"
     :can-convert-to-paragraph="contextBlockCanConvertToParagraph" :has-selection="selectionHasText"
     :in-code-block="selectionInCodeBlock" :position="contextMenuPosition"
      @clear-formatting="editorCommands.clearInlineFormatting" @close="closeContextMenu"
      @convert-to-paragraph="editorCommands.convertCurrentBlockToParagraph" @copy="editorCommands.copy"
      @cut="editorCommands.cut" @insert-blockquote="editorCommands.insertBlockquote"
      @insert-code-block="editorCommands.insertCodeBlock" @insert-heading="editorCommands.insertHeading"
      @insert-horizontal-rule="editorCommands.insertHorizontalRule" @insert-image="editorCommands.insertImageTemplate"
      @insert-list="editorCommands.insertList" @insert-table="editorCommands.insertTable" @paste="editorCommands.paste"
      @redo="editorCommands.redo" @select-all="editorCommands.selectAll" @toggle-bold="editorCommands.toggleBold"
      @toggle-inline-code="editorCommands.toggleInlineCode" @toggle-italic="editorCommands.toggleItalic"
      @undo="editorCommands.undo" />
  </Teleport>
</template>

<style scoped>
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

.lume-wysiwyg-pane__content :deep(.lume-image-resizer.ProseMirror-selectednode .lume-image-resizer__handle) {
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

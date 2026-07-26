<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core'
import type { CmdKey } from '@milkdown/kit/core'
import {
  createCodeBlockCommand,
  imageSchema,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand } from '@milkdown/preset-gfm'
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { AllSelection, NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { $prose, $remark, $view, callCommand, replaceAll } from '@milkdown/kit/utils'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { Node as MarkdownNode } from '@milkdown/kit/transformer'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useDocument } from '@composables/useDocument'
import {
  importImageFile,
  isTauri,
  resolveImagePath,
  storeClipboardImage,
} from '../types/tauri'
import {
  MIN_IMAGE_ZOOM,
  clampImageZoom,
  parseSizedImageHtml,
  serializeSizedImageHtml,
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
import { useBaseMarkdown } from '@/features/editor/wysiwyg/baseMarkdown'
import { codeBlockInteractionPlugin } from '@/features/editor/wysiwyg/codeBlock'
import {
  findTextMatches,
  searchHighlightPlugin,
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
let editorClipboardText = ''
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
const ONLINE_IMAGE_URL_PATTERN = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#]\S*)?$/i
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

type MarkdownTreeNode = MarkdownNode & {
  alt?: unknown
  children?: MarkdownTreeNode[]
  data?: { align?: unknown; zoom?: unknown }
  title?: unknown
  url?: unknown
  value?: unknown
}

function transformSizedImageHtml(node: MarkdownTreeNode): MarkdownTreeNode {
  if (node.type === 'html' && typeof node.value === 'string') {
    const image = parseSizedImageHtml(node.value)
    if (image) {
      return {
        type: 'image',
        url: image.src,
        alt: image.alt,
        title: image.title,
        data: { align: image.align, zoom: image.zoom },
      } as MarkdownTreeNode
    }
  }

  if (node.children) node.children = node.children.map(transformSizedImageHtml)
  return node
}

const sizedImageRemarkPlugin = $remark(
  'sizedImageHtml',
  () => () => (tree: MarkdownNode) => {
    transformSizedImageHtml(tree as MarkdownTreeNode)
  },
)

const sizedImageSchema = imageSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      zoom: { default: 100, validate: 'number' },
      align: { default: 'left', validate: 'string' },
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image',
      runner: (state, node, type) => {
        const image = node as MarkdownTreeNode
        const zoom = typeof image.data?.zoom === 'number'
          ? clampImageZoom(image.data.zoom)
          : 100
        const align = image.data?.align === 'center' || image.data?.align === 'right'
          ? image.data.align
          : 'left'
        state.addNode(type, {
          src: String(image.url ?? ''),
          alt: String(image.alt ?? ''),
          title: String(image.title ?? ''),
          zoom,
          align,
        })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image',
      runner: (state, node) => {
        const zoom = clampImageZoom(Number(node.attrs.zoom) || 100)
        const align = node.attrs.align === 'center' || node.attrs.align === 'right'
          ? node.attrs.align
          : 'left'
        if (zoom === 100 && align === 'left') {
          schema.toMarkdown.runner(state, node)
          return
        }
        state.addNode('html', undefined, serializeSizedImageHtml({
          src: String(node.attrs.src ?? ''),
          alt: String(node.attrs.alt ?? ''),
          title: String(node.attrs.title ?? ''),
          zoom,
          align,
        }))
      },
    },
  }
})

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function insertImage(
  view: EditorView,
  src: string,
  alt: string,
  point?: { x: number; y: number },
) {
  const image = view.state.schema.nodes.image.create({ src, alt, title: '' })
  let tr = view.state.tr
  if (point) {
    const dropPosition = view.posAtCoords({ left: point.x, top: point.y })
    if (dropPosition) {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(dropPosition.pos)))
    }
  }
  view.dispatch(tr.replaceSelectionWith(image).scrollIntoView())
  view.focus()
}

function getImageAlt(src: string) {
  try {
    const fileName = decodeURIComponent(new URL(src).pathname.split('/').at(-1) ?? '')
    return fileName.replace(/\.[^.]+$/, '') || 'image'
  } catch {
    return 'image'
  }
}

function updateSearchPlugin(view: EditorView, matches = findMatches.value, activeIndex = activeFindMatchIndex.value) {
  updateSearchHighlight(view, matches, activeIndex)
}

function convertImageUrlBeforeCursor(view: EditorView, createFollowingParagraph: boolean) {
  const { state } = view
  const { $from, empty } = state.selection
  if (
    !empty
    || $from.parent.type.name !== 'paragraph'
    || $from.parentOffset !== $from.parent.content.size
  ) return false

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const src = textBeforeCursor.match(
    /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#]\S*)?$/i,
  )?.[0]
  if (!src) return false

  const contentFrom = $from.pos - src.length
  const contentTo = $from.pos
  const blockEnd = $from.after()
  const image = state.schema.nodes.image.create({ src, alt: getImageAlt(src), title: '' })
  let tr = state.tr.replaceWith(contentFrom, contentTo, image)

  if (createFollowingParagraph) {
    const insertPos = tr.mapping.map(blockEnd)
    tr = tr
      .insert(insertPos, state.schema.nodes.paragraph.create())
      .setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
  } else {
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(contentFrom + image.nodeSize)))
  }

  view.dispatch(tr.scrollIntoView())
  return true
}

function selectImageFromEvent(view: EditorView, event: MouseEvent | PointerEvent) {
  if (event.button !== 0) return false
  const imageElement = (event.target as Element | null)?.closest('.lume-image-resizer')
  if (!(imageElement instanceof HTMLElement)) return false

  event.preventDefault()
  event.stopPropagation()
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, view.posAtDOM(imageElement, 0))).scrollIntoView())
  view.focus()
  return true
}

function deleteAdjacentImage(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false

  const { state } = view
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    event.preventDefault()
    view.dispatch(state.tr.delete(selection.from, selection.to).scrollIntoView())
    return true
  }
  if (!selection.empty) return false

  const { $from } = selection
  const before = $from.nodeBefore
  const after = $from.nodeAfter
  const target = event.key === 'Delete'
    ? after?.type.name === 'image'
      ? { from: $from.pos, to: $from.pos + after.nodeSize }
      : before?.type.name === 'image'
        ? { from: $from.pos - before.nodeSize, to: $from.pos }
        : null
    : before?.type.name === 'image'
      ? { from: $from.pos - before.nodeSize, to: $from.pos }
      : after?.type.name === 'image'
        ? { from: $from.pos, to: $from.pos + after.nodeSize }
        : null

  if (!target) return false
  event.preventDefault()
  view.dispatch(state.tr.delete(target.from, target.to).scrollIntoView())
  return true
}

function insertPastedImageUrl(view: EditorView, event: ClipboardEvent) {
  const src = event.clipboardData?.getData('text/plain').trim() ?? ''
  if (!ONLINE_IMAGE_URL_PATTERN.test(src)) return false

  event.preventDefault()
  insertImage(view, src, getImageAlt(src))
  return true
}

async function importClipboardImages(view: EditorView, files: File[]) {
  const documentId = activeDocument.value?.id
  const documentPath = activeDocument.value?.path ?? null
  if (!documentId) return

  for (const file of files) {
    try {
      const extension = IMAGE_MIME_EXTENSIONS[file.type]
      if (!extension) continue
      const src = isTauri()
        ? (await storeClipboardImage(
            Array.from(new Uint8Array(await file.arrayBuffer())),
            extension,
            documentPath,
            documentId,
          )).markdownPath
        : await fileToDataUrl(file)

      if (activeDocument.value?.id !== documentId || view.isDestroyed) return
      insertImage(view, src, file.name.replace(/\.[^.]+$/, '') || 'image')
    } catch (error) {
      console.error('粘贴图片失败:', error)
    }
  }
}

async function importNativeImages(view: EditorView, detail: NativeImageDropDetail) {
  const documentId = activeDocument.value?.id
  const documentPath = activeDocument.value?.path ?? null
  if (!documentId) return

  let useDropPoint = true
  for (const path of detail.paths) {
    try {
      const asset = await importImageFile(path, documentPath, documentId)
      if (activeDocument.value?.id !== documentId || view.isDestroyed) return
      const fileName = path.split(/[\\/]/).at(-1) ?? 'image'
      insertImage(
        view,
        asset.markdownPath,
        fileName.replace(/\.[^.]+$/, ''),
        useDropPoint ? { x: detail.x, y: detail.y } : undefined,
      )
      useDropPoint = false
    } catch (error) {
      console.error('导入图片失败:', error)
    }
  }
}

const localImageView = $view(sizedImageSchema.node, () => (
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
) => {
  const dom = document.createElement('span')
  const imageElement = document.createElement('img')
  const resizeHandle = document.createElement('span')
  let currentNode = node
  let currentZoom = 100
  let loadSequence = 0
  let resizeCleanup: (() => void) | null = null
  let animationFrame: number | null = null

  dom.className = 'lume-image-resizer'
  dom.contentEditable = 'false'
  resizeHandle.className = 'lume-image-resizer__handle'
  resizeHandle.title = '拖动调整图片大小'
  dom.append(imageElement, resizeHandle)

  const applyZoom = () => {
    animationFrame = null
    const parentWidth = dom.parentElement?.getBoundingClientRect().width ?? 0
    const naturalWidth = imageElement.naturalWidth || parentWidth
    if (parentWidth > 0 && naturalWidth > 0) {
      const baseWidth = Math.min(parentWidth, naturalWidth)
      dom.style.width = `${Math.min(parentWidth, baseWidth * currentZoom / 100)}px`
    }
  }

  const scheduleZoom = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(applyZoom)
  }

  const updateImage = (updatedNode: ProseNode) => {
    currentNode = updatedNode
    const sequence = ++loadSequence
    const { src, alt, title, zoom, align } = updatedNode.attrs as {
      src: string
      alt: string
      title: string
      zoom: number
      align: ImageAlign
    }
    const currentAlign = align === 'center' || align === 'right' ? align : 'left'
    currentZoom = clampImageZoom(Number(zoom) || 100)
    dom.dataset.align = currentAlign
    imageElement.alt = alt || ''
    imageElement.title = title || ''
    imageElement.classList.remove('lume-image--error')
    scheduleZoom()

    if (!src || REMOTE_IMAGE_PATTERN.test(src) || !isTauri()) {
      imageElement.src = src
      return
    }

    imageElement.removeAttribute('src')
    void resolveImagePath(
      src,
      activeDocument.value?.path ?? null,
      activeDocument.value?.id ?? '',
    ).then((path) => {
      if (sequence === loadSequence) imageElement.src = convertFileSrc(path)
    }).catch((error) => {
      if (sequence === loadSequence) imageElement.classList.add('lume-image--error')
      console.warn(`无法加载本地图片 ${src}:`, error)
    })
  }

  const handleResizeStart = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = dom.getBoundingClientRect().width
    const baseWidth = startWidth / (currentZoom / 100)
    const parentWidth = dom.parentElement?.getBoundingClientRect().width ?? startWidth
    let nextZoom = currentZoom

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const width = Math.min(parentWidth, Math.max(baseWidth * MIN_IMAGE_ZOOM / 100, startWidth + moveEvent.clientX - startX))
      nextZoom = clampImageZoom(width / baseWidth * 100)
      dom.style.width = `${Math.min(parentWidth, baseWidth * nextZoom / 100)}px`
    }

    const finishResize = () => {
      resizeCleanup?.()
      resizeCleanup = null
      const pos = getPos()
      if (typeof pos !== 'number' || nextZoom === currentZoom) {
        scheduleZoom()
        return
      }
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
        ...currentNode.attrs,
        zoom: nextZoom,
      }).scrollIntoView())
    }

    resizeCleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishResize)
      window.removeEventListener('pointercancel', finishResize)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishResize)
    window.addEventListener('pointercancel', finishResize)
  }

  const getImagePos = () => {
    const pos = getPos()
    return typeof pos === 'number' ? pos : view.posAtDOM(dom, 0)
  }

  const selectImage = (event: MouseEvent | PointerEvent) => {
    if (event.button !== 0) return
    const pos = getImagePos()
    event.preventDefault()
    event.stopPropagation()
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView())
    view.focus()
    const selection = view.state.selection
    if (selection instanceof NodeSelection) updateSelectedImageToolbar(view, selection)
  }

  dom.addEventListener('pointerdown', selectImage)
  dom.addEventListener('mousedown', selectImage)
  imageElement.addEventListener('load', scheduleZoom)
  imageElement.addEventListener('error', () => imageElement.classList.add('lume-image--error'))
  resizeHandle.addEventListener('pointerdown', handleResizeStart)
  window.addEventListener('resize', scheduleZoom)
  updateImage(node)
  return {
    dom,
    selectNode() {
      dom.classList.add('ProseMirror-selectednode')
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode')
    },
    stopEvent(event: Event) {
      return event.type === 'mousedown' || event.type === 'pointerdown'
    },
    update(updatedNode: ProseNode) {
      if (updatedNode.type !== currentNode.type) return false
      updateImage(updatedNode)
      return true
    },
    destroy() {
      resizeCleanup?.()
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', scheduleZoom)
    },
  }
})

const imageInputPlugin = $prose(() => new Plugin({
  props: {
    handleClickOn(view, _pos, node, nodePos, event, direct) {
      if (!direct || node.type.name !== 'image') return false
      event.preventDefault()
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)).scrollIntoView())
      view.focus()
      return true
    },
    handleDOMEvents: {
      mousedown: selectImageFromEvent,
      pointerdown: selectImageFromEvent,
    },
    handlePaste(view, event) {
      const images = Array.from(event.clipboardData?.files ?? [])
        .filter((file) => file.type in IMAGE_MIME_EXTENSIONS)
      if (images.length === 0) return insertPastedImageUrl(view, event)
      event.preventDefault()
      void importClipboardImages(view, images)
      return true
    },
    handleKeyDown(view, event) {
      if (deleteAdjacentImage(view, event)) return true
      if (event.key === 'Tab' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        if (!event.shiftKey) {
          const indent = '    '
          const { from, to } = view.state.selection
          const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(indent))
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + indent.length)).scrollIntoView())
        }
        return true
      }
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
      if (event.key !== 'Enter' && event.key !== ' ') return false
      const converted = convertImageUrlBeforeCursor(view, event.key === 'Enter')
      if (converted) event.preventDefault()
      return converted
    },
    handleDrop(view, event) {
      const images = Array.from(event.dataTransfer?.files ?? [])
        .filter((file) => file.type in IMAGE_MIME_EXTENSIONS)
      if (images.length === 0) return false
      event.preventDefault()
      void importClipboardImages(view, images)
      return true
    },
  },
}))

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

function getConvertibleBlockPosition(state: EditorState) {
  const { from, to } = state.selection
  const start = state.doc.resolve(from)
  const end = state.doc.resolve(Math.max(from, to - 1))

  for (let depth = start.depth; depth > 0; depth -= 1) {
    const node = start.node(depth)
    if (!['heading', 'code_block'].includes(node.type.name)) continue

    const position = start.before(depth)
    for (let endDepth = end.depth; endDepth > 0; endDepth -= 1) {
      if (end.before(endDepth) === position && end.node(endDepth) === node) return position
    }
  }

  return null
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

function runCommand<T>(command: CmdKey<T>, payload?: T) {
  closeContextMenu()
  editor?.action((ctx) => {
    ctx.get(editorViewCtx).focus()
    return callCommand(command, payload)(ctx)
  })
}

function runWithView(action: (view: EditorView) => void) {
  closeContextMenu()
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view.focus()
    action(view)
  })
}

function runNativeEditCommand(command: 'copy' | 'cut') {
  runWithView((view) => {
    const { from, to, empty } = view.state.selection
    if (empty) return

    editorClipboardText = view.state.doc.textBetween(from, to, '\n', '\n')
    // 原生剪切事件会由 ProseMirror 写入剪贴板并删除选区，无需再次手动删除。
    document.execCommand(command)

    if (command === 'copy') {
      closeBubbleToolbar()
    }
  })
}

function pasteText() {
  runWithView((view) => {
    if (editorClipboardText) {
      view.dispatch(view.state.tr.insertText(editorClipboardText).scrollIntoView())
      return
    }

    document.execCommand('paste')
  })
}

function insertMarkdownTemplate(template: string, cursorOffset = template.length) {
  runWithView((view) => {
    const { from, to } = view.state.selection
    const tr = view.state.tr.insertText(template, from, to)
    const cursorPos = from + cursorOffset
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, cursorPos)).scrollIntoView())
  })
}

function insertHeading(level: number) {
  runWithView((view) => {
    const heading = view.state.schema.nodes.heading
    if (!heading) return
    const { from, to } = view.state.selection
    const text = view.state.doc.textBetween(from, to, '\n', '\n') || '标题'
    const node = heading.create({ level }, view.state.schema.text(text))
    const tr = view.state.tr.replaceRangeWith(from, to, node)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + text.length)).scrollIntoView())
  })
}

function insertBlockquote() {
  runWithView((view) => {
    const blockquote = view.state.schema.nodes.blockquote
    const paragraph = view.state.schema.nodes.paragraph
    if (!blockquote || !paragraph) return
    const { from, to } = view.state.selection
    const text = view.state.doc.textBetween(from, to, '\n', '\n') || '引用'
    const node = blockquote.create(null, paragraph.create(null, view.state.schema.text(text)))
    const tr = view.state.tr.replaceRangeWith(from, to, node)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2, from + 2 + text.length)).scrollIntoView())
  })
}

function insertList(ordered: boolean) {
  runWithView((view) => {
    const list = ordered ? view.state.schema.nodes.ordered_list : view.state.schema.nodes.bullet_list
    const listItem = view.state.schema.nodes.list_item
    const paragraph = view.state.schema.nodes.paragraph
    if (!list || !listItem || !paragraph) return
    const { from, to } = view.state.selection
    const text = view.state.doc.textBetween(from, to, '\n', '\n') || '列表项'
    const node = list.create(null, listItem.create(null, paragraph.create(null, view.state.schema.text(text))))
    const tr = view.state.tr.replaceRangeWith(from, to, node)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 3, from + 3 + text.length)).scrollIntoView())
  })
}

function clearInlineFormatting() {
  runWithView((view) => {
    const { state } = view
    const { from, to } = state.selection
    const tr = Object.values(state.schema.marks).reduce(
      (transaction, markType) => transaction.removeMark(from, to, markType),
      state.tr,
    )
    view.dispatch(tr.scrollIntoView())
  })
}

function convertCurrentBlockToParagraph() {
  runWithView((view) => {
    const position = getConvertibleBlockPosition(view.state)
    const paragraph = view.state.schema.nodes.paragraph
    if (position === null || !paragraph) return

    view.dispatch(view.state.tr.setNodeMarkup(position, paragraph).scrollIntoView())
  })
}

function setSelectedImageAlign(align: ImageAlign) {
  runWithView((view) => {
    const selection = view.state.selection
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
    const tr = view.state.tr.setNodeMarkup(selection.from, undefined, {
      ...selection.node.attrs,
      align,
    })
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, selection.from)).scrollIntoView())
    selectedImageAlign.value = align
    requestAnimationFrame(() => {
      const nextSelection = view.state.selection
      if (nextSelection instanceof NodeSelection) updateSelectedImageToolbar(view, nextSelection)
    })
  })
}

function selectAllContent() {
  runWithView((view) => {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  })
}

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
    void importNativeImages(ctx.get(editorViewCtx), detail)
  })
}

onMounted(async () => {
  if (!editorRef.value) return

  editor = await useBaseMarkdown(Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value!)
      ctx.set(defaultValueCtx, content.value)

      ctx.get(listenerCtx)
        .markdownUpdated((ctx, markdown) => {
          editorMarkdown = markdown
          if (boundDocumentId && updateDocumentContent(boundDocumentId, markdown)) {
            persistDocumentSession()
          }
          if (findReplaceOpen.value) {
            try {
              syncFindMatches(ctx.get(editorViewCtx))
            } catch {
              // editorViewCtx may not be available during initial listener hydration.
            }
          }
        })
        .selectionUpdated((ctx, selection) => {
          const before = selection.$from.doc.textBetween(0, selection.from, '\n', '\n')
          const lines = before.split('\n')
          if (boundDocumentId) updateDocumentCursor(boundDocumentId, lines.length, (lines.at(-1)?.length || 0) + 1)
          let view: EditorView | null = null
          try {
            view = ctx.get(editorViewCtx)
          } catch {
            view = null
          }
          updateBubbleToolbar(view)
        })
    }))
    .use(sizedImageSchema)
    .use(sizedImageRemarkPlugin)
    .use(history)
    .use(localImageView)
    .use(searchHighlightPlugin)
    .use(imageInputPlugin)
    .use(codeBlockInteractionPlugin)
    .use(listener)
    .create()

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
  editor.action(replaceAll(markdown))
})

onBeforeUnmount(() => {
  cancelAnimationFrame(collapseSelectionFrame)
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.removeEventListener('blur', handleWindowResize)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('lume:image-drop', handleNativeImageDrop)
  void editor?.destroy()
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
      :position="bubbleToolbarPosition" @clear-formatting="clearInlineFormatting" @copy="runNativeEditCommand('copy')"
      @toggle-bold="runCommand(toggleStrongCommand.key)" @toggle-inline-code="runCommand(toggleInlineCodeCommand.key)"
      @toggle-italic="runCommand(toggleEmphasisCommand.key)" />

  <ImageToolbar
      v-if="imageToolbarOpen"
:align="selectedImageAlign" :position="imageToolbarPosition"
      @align="setSelectedImageAlign" />

  <EditorContextMenu
      v-if="contextMenuOpen"
      ref="contextMenu"
     :can-convert-to-paragraph="contextBlockCanConvertToParagraph" :has-selection="selectionHasText"
      :in-code-block="selectionInCodeBlock" :position="contextMenuPosition" @clear-formatting="clearInlineFormatting"
      @close="closeContextMenu" @convert-to-paragraph="convertCurrentBlockToParagraph"
      @copy="runNativeEditCommand('copy')" @cut="runNativeEditCommand('cut')" @insert-blockquote="insertBlockquote"
      @insert-code-block="runCommand(createCodeBlockCommand.key)" @insert-heading="insertHeading"
      @insert-horizontal-rule="runCommand(insertHrCommand.key)"
      @insert-image="insertMarkdownTemplate('![图片描述](图片地址)', 7)" @insert-list="insertList"
      @insert-table="runCommand(insertTableCommand.key, { row: 3, col: 3 })" @paste="pasteText"
      @redo="runCommand(redoCommand.key)" @select-all="selectAllContent"
      @toggle-bold="runCommand(toggleStrongCommand.key)" @toggle-inline-code="runCommand(toggleInlineCodeCommand.key)"
      @toggle-italic="runCommand(toggleEmphasisCommand.key)" @undo="runCommand(undoCommand.key)" />
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

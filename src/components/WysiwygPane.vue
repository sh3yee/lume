<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp, Code, Copy, Italic, RemoveFormatting, X } from 'lucide-vue-next'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core'
import type { CmdKey } from '@milkdown/kit/core'
import {
  commonmark,
  createCodeBlockCommand,
  imageSchema,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { AllSelection, NodeSelection, Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
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

const {
  activeDocument,
  content,
  persistDocumentSession,
  updateDocumentContent,
  updateDocumentCursor,
} = useDocument()
const boundDocumentId = activeDocument.value?.id ?? null

const editorRef = ref<HTMLDivElement | null>(null)
const findInput = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
const contextMenu = ref<HTMLDivElement | null>(null)
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
const findQuery = ref('')
const replaceValue = ref('')
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

interface SearchMatch {
  from: number
  to: number
}

interface SearchPluginState {
  activeIndex: number
  matches: SearchMatch[]
}

const searchPluginKey = new PluginKey<SearchPluginState>('lume-current-document-search')

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

function createParagraphAfterCodeBlock(state: EditorState) {
  const { $from } = state.selection
  const codeBlock = $from.parent
  if (codeBlock.type.name !== 'code_block' || !$from.parentOffset) return null
  if ($from.parentOffset !== codeBlock.content.size || !codeBlock.textContent.endsWith('\n')) return null

  const paragraph = state.schema.nodes.paragraph.create()
  const insertPos = $from.after()
  const tr = state.tr.insert(insertPos, paragraph)
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
    .scrollIntoView()
}

function convertEmptyCodeBlockToParagraph(state: EditorState) {
  const { $from, empty } = state.selection
  const codeBlock = $from.parent
  if (!empty || codeBlock.type.name !== 'code_block' || codeBlock.content.size !== 0) return null

  const blockPos = $from.before()
  const tr = state.tr.setNodeMarkup(blockPos, state.schema.nodes.paragraph)
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(blockPos + 1)))
    .scrollIntoView()
}

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

function findTextMatches(doc: ProseNode, query: string): SearchMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []

  const matches: SearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLocaleLowerCase()
    let index = text.indexOf(needle)
    while (index >= 0) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = text.indexOf(needle, index + Math.max(needle.length, 1))
    }
  })
  return matches
}

function updateSearchPlugin(view: EditorView, matches = findMatches.value, activeIndex = activeFindMatchIndex.value) {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { matches, activeIndex }))
}

const searchHighlightPlugin = $prose(() => new Plugin<SearchPluginState>({
  key: searchPluginKey,
  state: {
    init: () => ({ matches: [], activeIndex: -1 }),
    apply(tr, value) {
      const next = tr.getMeta(searchPluginKey) as SearchPluginState | undefined
      if (next) return next
      if (!tr.docChanged || value.matches.length === 0) return value
      const matches = value.matches
        .map((match) => ({ from: tr.mapping.map(match.from), to: tr.mapping.map(match.to) }))
        .filter((match) => match.from < match.to)
      return {
        matches,
        activeIndex: matches[value.activeIndex] ? value.activeIndex : matches.length > 0 ? 0 : -1,
      }
    },
  },
  props: {
    decorations(state) {
      const pluginState = searchPluginKey.getState(state)
      if (!pluginState?.matches.length) return DecorationSet.empty
      return DecorationSet.create(state.doc, pluginState.matches.map((match, index) => Decoration.inline(
        match.from,
        match.to,
        { class: index === pluginState.activeIndex ? 'lume-search-match lume-search-match--active' : 'lume-search-match' },
      )))
    },
  },
}))

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

const codeBlockExitPlugin = $prose(() => new Plugin({
  appendTransaction(_transactions, _oldState, newState) {
    if (newState.doc.lastChild?.type.name !== 'code_block') return null

    return newState.tr.insert(newState.doc.content.size, newState.schema.nodes.paragraph.create())
  },
  props: {
    handleKeyDown(view, event) {
      if (
        event.key === 'Backspace'
        && !event.isComposing
        && !event.shiftKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        const tr = convertEmptyCodeBlockToParagraph(view.state)
        if (!tr) return false

        event.preventDefault()
        view.dispatch(tr)
        return true
      }

      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false

      const tr = createParagraphAfterCodeBlock(view.state)
      if (!tr) return false

      event.preventDefault()
      view.dispatch(tr)
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
  const toolbarWidth = 90
  const toolbarHeight = 34
  const margin = 8
  const preferredY = bounds.top - toolbarHeight - margin
  const fallbackY = bounds.bottom + margin
  imageToolbarPosition.value = {
    x: Math.max(margin, Math.min(bounds.left + bounds.width / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - margin)),
    y: preferredY >= margin ? preferredY : Math.min(fallbackY, window.innerHeight - toolbarHeight - margin),
  }
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
  const toolbarWidth = selectionTouchesCodeBlock(view.state) ? 34 : 184
  const toolbarHeight = 34
  const margin = 8
  const selectionLeft = Math.min(start.left, end.left)
  const selectionRight = Math.max(start.right, end.right)
  const x = selectionLeft + (selectionRight - selectionLeft) / 2 - toolbarWidth / 2
  const preferredY = Math.min(start.top, end.top) - toolbarHeight - margin
  const fallbackY = Math.max(start.bottom, end.bottom) + margin

  bubbleToolbarPosition.value = {
    x: Math.max(margin, Math.min(x, window.innerWidth - toolbarWidth - margin)),
    y: preferredY >= margin ? preferredY : Math.min(fallbackY, window.innerHeight - toolbarHeight - margin),
  }
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
  const menuHeight = 292
  const margin = 8

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

  contextMenuPosition.value = {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  }
  closeBubbleToolbar()
  contextMenuOpen.value = true
  await nextTick()
  contextMenu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

function runCommand(command: CmdKey<unknown>, payload?: unknown) {
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
    document.execCommand(command)

    if (command === 'copy') {
      closeBubbleToolbar()
      return
    }

    view.dispatch(view.state.tr.delete(from, to).scrollIntoView())
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

function syncFindMatches(view: EditorView, preferredIndex = activeFindMatchIndex.value) {
  const matches = findTextMatches(view.state.doc, findQuery.value)
  const activeIndex = matches.length === 0 ? -1 : Math.max(0, Math.min(preferredIndex, matches.length - 1))
  findMatches.value = matches
  activeFindMatchIndex.value = activeIndex
  updateSearchPlugin(view, matches, activeIndex)
  return { activeIndex, matches }
}

function focusFindInput(select = false) {
  void nextTick(() => {
    findInput.value?.focus()
    if (select) findInput.value?.select()
  })
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
  focusFindInput(select)
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

function moveFindMatch(direction: 1 | -1) {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches } = syncFindMatches(view)
    if (matches.length === 0) return
    const nextIndex = (activeFindMatchIndex.value + direction + matches.length) % matches.length
    selectFindMatch(view, nextIndex)
    view.focus()
  })
}

function handleFindQueryInput() {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { activeIndex } = syncFindMatches(view, 0)
    if (activeIndex >= 0) selectFindMatch(view, activeIndex)
  })
}

function replaceCurrentMatch() {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches, activeIndex } = syncFindMatches(view)
    const match = matches[activeIndex]
    if (!match) return
    const tr = view.state.tr.insertText(replaceValue.value, match.from, match.to)
    view.dispatch(tr.scrollIntoView())
    const nextMatches = findTextMatches(view.state.doc, findQuery.value)
    const nextIndex = nextMatches.length === 0 ? -1 : Math.min(activeIndex, nextMatches.length - 1)
    findMatches.value = nextMatches
    activeFindMatchIndex.value = nextIndex
    updateSearchPlugin(view, nextMatches, nextIndex)
    if (nextIndex >= 0) selectFindMatch(view, nextIndex)
  })
}

function replaceAllMatches() {
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { matches } = syncFindMatches(view)
    if (matches.length === 0) return
    const tr = matches.reduceRight(
      (transaction, match) => transaction.insertText(replaceValue.value, match.from, match.to),
      view.state.tr,
    )
    view.dispatch(tr.scrollIntoView())
    findMatches.value = []
    activeFindMatchIndex.value = -1
    updateSearchPlugin(view, [], -1)
  })
}

function handleFindKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    moveFindMatch(event.shiftKey ? -1 : 1)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeFindReplace()
  }
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeContextMenu()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = Array.from(
    contextMenu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  )
  if (items.length === 0) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') items[0].focus()
  else if (event.key === 'End') items[items.length - 1].focus()
  else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + items.length) % items.length
    items[nextIndex].focus()
  }
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

  editor = await Editor.make()
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
    })
    .use(commonmark)
    .use(sizedImageSchema)
    .use(sizedImageRemarkPlugin)
    .use(history)
    .use(localImageView)
    .use(searchHighlightPlugin)
    .use(imageInputPlugin)
    .use(codeBlockExitPlugin)
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
    <div ref="editorRef" class="lume-wysiwyg-pane__content" @contextmenu.prevent="openContextMenu"></div>

    <div v-if="findReplaceOpen" class="lume-wysiwyg-pane__find-widget" @keydown="handleFindKeydown">
      <div class="lume-wysiwyg-pane__find-row">
        <input
          ref="findInput"
          v-model="findQuery"
          class="lume-wysiwyg-pane__find-input"
          type="text"
          placeholder="查找"
          @input="handleFindQueryInput"
        />
        <span class="lume-wysiwyg-pane__find-count">
          {{ findMatches.length > 0 ? `${activeFindMatchIndex + 1} / ${findMatches.length}` : '0 / 0' }}
        </span>
        <button type="button" title="上一个" aria-label="上一个" :disabled="findMatches.length === 0" @click="moveFindMatch(-1)">
          <ChevronUp :size="14" :stroke-width="2" />
        </button>
        <button type="button" title="下一个" aria-label="下一个" :disabled="findMatches.length === 0" @click="moveFindMatch(1)">
          <ChevronDown :size="14" :stroke-width="2" />
        </button>
        <button type="button" title="关闭" aria-label="关闭" @click="closeFindReplace">
          <X :size="14" :stroke-width="2" />
        </button>
      </div>
      <div class="lume-wysiwyg-pane__find-row">
        <input
          ref="replaceInput"
          v-model="replaceValue"
          class="lume-wysiwyg-pane__find-input"
          type="text"
          placeholder="替换"
        />
        <button type="button" :disabled="findMatches.length === 0" @click="replaceCurrentMatch">
          替换
        </button>
        <button type="button" :disabled="findMatches.length === 0" @click="replaceAllMatches">
          全部替换
        </button>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="bubbleToolbarOpen"
      class="lume-wysiwyg-pane__bubble-toolbar"
      role="toolbar"
      aria-label="选中文本格式"
      :style="{ left: bubbleToolbarPosition.x + 'px', top: bubbleToolbarPosition.y + 'px' }"
      @pointerdown.stop.prevent
    >
     <template v-if="!selectionInCodeBlock">
        <button type="button" aria-label="加粗" data-tooltip="加粗" @click="runCommand(toggleStrongCommand.key)">
          <Bold :size="15" :stroke-width="2.25" />
        </button>
       <button type="button" aria-label="斜体" data-tooltip="斜体" @click="runCommand(toggleEmphasisCommand.key)">
          <Italic :size="15" :stroke-width="2.25" />
        </button>
       <button type="button" aria-label="行内代码" data-tooltip="行内代码" @click="runCommand(toggleInlineCodeCommand.key)">
          <Code :size="15" :stroke-width="2.1" />
        </button>
        <div class="lume-wysiwyg-pane__bubble-separator" role="separator"></div>
       <button type="button" aria-label="清除行内格式" data-tooltip="清除行内格式" @click="clearInlineFormatting">
          <RemoveFormatting :size="15" :stroke-width="2.1" />
        </button>
     </template>
      <button type="button" aria-label="复制" data-tooltip="复制" @click="runNativeEditCommand('copy')">
        <Copy :size="15" :stroke-width="2.1" />
      </button>
    </div>

    <div
      v-if="imageToolbarOpen"
      class="lume-wysiwyg-pane__bubble-toolbar lume-wysiwyg-pane__image-toolbar"
      role="toolbar"
      aria-label="图片对齐"
      :style="{ left: imageToolbarPosition.x + 'px', top: imageToolbarPosition.y + 'px' }"
      @pointerdown.stop.prevent
    >
      <button
type="button"
        aria-label="左对齐"
data-tooltip="左对齐"
        :class="{ 'lume-wysiwyg-pane__toolbar-button--active': selectedImageAlign === 'left' }"
        @click="setSelectedImageAlign('left')"
      >
        <AlignLeft :size="15" :stroke-width="2.1" />
      </button>
      <button
type="button"
        aria-label="居中"
data-tooltip="居中"
        :class="{ 'lume-wysiwyg-pane__toolbar-button--active': selectedImageAlign === 'center' }"
        @click="setSelectedImageAlign('center')"
      >
        <AlignCenter :size="15" :stroke-width="2.1" />
      </button>
      <button
type="button"
        aria-label="右对齐"
data-tooltip="右对齐"
        :class="{ 'lume-wysiwyg-pane__toolbar-button--active': selectedImageAlign === 'right' }"
        @click="setSelectedImageAlign('right')"
      >
        <AlignRight :size="15" :stroke-width="2.1" />
      </button>
    </div>

    <div
      v-if="contextMenuOpen"
      ref="contextMenu"
      class="lume-wysiwyg-pane__context-menu"
      role="menu"
      aria-label="编辑区操作"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @pointerdown.stop
    >
      <template v-if="selectionHasText">
        <button type="button" role="menuitem" @click="runNativeEditCommand('copy')">
          <span>复制</span>
        </button>
        <button type="button" role="menuitem" @click="runNativeEditCommand('cut')">
          <span>剪切</span>
        </button>
        <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
       <template v-if="!selectionInCodeBlock">
         <button type="button" role="menuitem" @click="runCommand(toggleStrongCommand.key)">
            <span>加粗</span>
          </button>
          <button type="button" role="menuitem" @click="runCommand(toggleEmphasisCommand.key)">
            <span>斜体</span>
          </button>
          <button type="button" role="menuitem" @click="runCommand(toggleInlineCodeCommand.key)">
            <span>行内代码</span>
          </button>
         <button type="button" role="menuitem" @click="clearInlineFormatting">
            <span>清除行内格式</span>
          </button>
        </template>
        <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
      </template>

      <template v-if="contextBlockCanConvertToParagraph">
        <button type="button" role="menuitem" @click="convertCurrentBlockToParagraph">
          <span>转为正文</span>
        </button>
        <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
      </template>

      <button type="button" role="menuitem" @click="pasteText">
        <span>粘贴</span>
      </button>
      <div class="lume-wysiwyg-pane__context-submenu" role="none">
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded="false">
          <span>插入</span>
          <span class="lume-wysiwyg-pane__context-submenu-arrow">›</span>
        </button>
        <div class="lume-wysiwyg-pane__context-submenu-menu" role="menu" aria-label="插入">
          <button type="button" role="menuitem" @click="runCommand(insertHrCommand.key)">
            <span>分割线</span>
          </button>
          <button type="button" role="menuitem" @click="runCommand(createCodeBlockCommand.key)">
            <span>代码块</span>
          </button>
          <button type="button" role="menuitem" @click="insertBlockquote">
            <span>引用</span>
          </button>
          <button type="button" role="menuitem" @click="insertList(false)">
            <span>无序列表</span>
          </button>
          <button type="button" role="menuitem" @click="insertList(true)">
            <span>有序列表</span>
          </button>
          <button type="button" role="menuitem" @click="insertHeading(1)">
            <span>一级标题</span>
          </button>
          <button type="button" role="menuitem" @click="insertHeading(2)">
            <span>二级标题</span>
          </button>
          <button type="button" role="menuitem" @click="insertHeading(3)">
            <span>三级标题</span>
          </button>
          <button type="button" role="menuitem" @click="insertMarkdownTemplate('![图片描述](图片地址)', 7)">
            <span>图片</span>
          </button>
        </div>
      </div>
      <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
      <button type="button" role="menuitem" @click="runCommand(undoCommand.key)">
        <span>撤销</span>
      </button>
      <button type="button" role="menuitem" @click="runCommand(redoCommand.key)">
        <span>重做</span>
      </button>
      <button type="button" role="menuitem" @click="selectAllContent">
        <span>全选</span>
      </button>
    </div>
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
  white-space: pre-wrap;
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
  vertical-align: text-bottom;
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

.lume-wysiwyg-pane__find-widget {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: var(--lume-z-tooltip);
  width: 348px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 70%, transparent);
  border-radius: 12px;
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 82%, transparent);
  color: var(--lume-text-secondary);
  box-shadow: 0 18px 48px rgb(0 0 0 / 16%), 0 2px 8px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 18%);
  backdrop-filter: blur(28px) saturate(1.35);
}

.lume-wysiwyg-pane__find-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lume-wysiwyg-pane__find-input {
  min-width: 0;
  flex: 1;
  height: 28px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 84%, transparent);
  border-radius: 7px;
  background-color: color-mix(in srgb, var(--lume-bg-surface-raised) 86%, transparent);
  color: var(--lume-text-primary);
  font-size: 13px;
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 5%);
}

.lume-wysiwyg-pane__find-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lume-accent-default) 72%, var(--lume-border-subtle));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lume-accent-default) 16%, transparent), inset 0 1px 2px rgb(0 0 0 / 5%);
}

.lume-wysiwyg-pane__find-count {
  width: 52px;
  color: var(--lume-text-tertiary);
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lume-wysiwyg-pane__find-widget button {
  height: 28px;
  min-width: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: 13px;
  cursor: default;
}

.lume-wysiwyg-pane__find-widget button:hover:not(:disabled),
.lume-wysiwyg-pane__find-widget button:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--lume-border-subtle) 72%, transparent);
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__find-widget button:disabled {
  color: var(--lume-text-disabled);
}

.lume-wysiwyg-pane__find-widget svg {
  flex: none;
}

.lume-wysiwyg-pane__bubble-toolbar {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  height: 34px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 78%, transparent);
  border-radius: 9px;
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 88%, transparent);
  color: var(--lume-text-secondary);
  box-shadow: 0 8px 22px rgb(0 0 0 / 12%), 0 1px 2px rgb(0 0 0 / 10%);
  user-select: none;
  backdrop-filter: blur(20px) saturate(1.35);
}

.lume-wysiwyg-pane__bubble-toolbar button {
  position: relative;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: default;
}

.lume-wysiwyg-pane__bubble-toolbar button::after {
  content: attr(data-tooltip);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 1;
  width: max-content;
  max-width: 140px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 78%, transparent);
  border-radius: 6px;
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-primary);
  box-shadow: 0 4px 12px rgb(0 0 0 / 14%);
  font-size: 12px;
  font-weight: var(--lume-font-weight-normal);
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -2px);
  transition: opacity 100ms ease, transform 100ms ease;
}

.lume-wysiwyg-pane__bubble-toolbar button:hover::after,
.lume-wysiwyg-pane__bubble-toolbar button:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
.lume-wysiwyg-pane__bubble-toolbar button:hover,
.lume-wysiwyg-pane__bubble-toolbar button:focus-visible,
.lume-wysiwyg-pane__bubble-toolbar .lume-wysiwyg-pane__toolbar-button--active {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 8%, transparent);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__image-toolbar {
  width: 90px;
}

.lume-wysiwyg-pane__bubble-toolbar svg {
  flex: none;
}

.lume-wysiwyg-pane__bubble-separator {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background-color: color-mix(in srgb, var(--lume-border-subtle) 82%, transparent);
}

.lume-wysiwyg-pane__context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  width: 192px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: blur(14px);
}

.lume-wysiwyg-pane__context-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--lume-font-size-sm);
  text-align: left;
  cursor: default;
}

.lume-wysiwyg-pane__context-menu button:hover,
.lume-wysiwyg-pane__context-menu button:focus-visible,
.lume-wysiwyg-pane__context-submenu:hover > button,
.lume-wysiwyg-pane__context-submenu:focus-within > button {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__context-submenu {
  position: relative;
}

.lume-wysiwyg-pane__context-submenu::after {
  content: '';
  position: absolute;
  top: -8px;
  right: -8px;
  width: 10px;
  height: calc(100% + 16px);
}

.lume-wysiwyg-pane__context-submenu > button {
  justify-content: space-between;
}

.lume-wysiwyg-pane__context-submenu-arrow {
  color: var(--lume-text-tertiary);
  font-size: 16px;
  line-height: 1;
}

.lume-wysiwyg-pane__context-submenu-menu {
  position: absolute;
  top: -8px;
  left: calc(100% + 2px);
  width: 156px;
  display: none;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  backdrop-filter: blur(14px);
}

.lume-wysiwyg-pane__context-submenu:hover .lume-wysiwyg-pane__context-submenu-menu,
.lume-wysiwyg-pane__context-submenu:focus-within .lume-wysiwyg-pane__context-submenu-menu {
  display: block;
}

.lume-wysiwyg-pane__context-separator {
  height: 1px;
  margin: var(--lume-space-2) var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}
</style>

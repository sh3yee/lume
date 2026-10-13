import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { SelectionToolbarModel } from '../wysiwyg/selectionToolbarItems'
import { pickSelectionAnchor } from '../wysiwyg/selectionGeometry'
import { positionOverlayAroundBounds } from '../overlays/overlayPosition'
import { canOpenEditorLink } from '../wysiwyg/editorLinks'

interface PreviewTarget {
  documentId: string | undefined
  html: string
  element: HTMLElement | null
  ranges: Range[]
  text: string
  backwards: boolean
  href?: string
}

export const arePreviewRangesEqual = (first: readonly Range[], second: readonly Range[]) =>
  first.length === second.length &&
  first.every(
    (range, index) =>
      range.startContainer === second[index].startContainer &&
      range.startOffset === second[index].startOffset &&
      range.endContainer === second[index].endContainer &&
      range.endOffset === second[index].endOffset,
  )

const getSelectionRanges = (selection: Selection | null) =>
  selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : []

const isPreviewTextSelection = (root: HTMLElement | null, selection: Selection | null) =>
  Boolean(
    root &&
    selection &&
    selection.rangeCount > 0 &&
    !selection.isCollapsed &&
    root.contains(selection.anchorNode) &&
    root.contains(selection.focusNode) &&
    getSelectionRanges(selection).every((range) => root.contains(range.commonAncestorContainer)),
  )

const isSelectionBackwards = (selection: Selection) => {
  if (!selection.anchorNode || !selection.focusNode || selection.isCollapsed) return false
  const range = selection.getRangeAt(0).cloneRange()
  range.setStart(selection.anchorNode, selection.anchorOffset)
  range.setEnd(selection.focusNode, selection.focusOffset)
  return range.collapsed
}

export const usePreviewInteractions = (options: {
  getRoot: () => HTMLElement | null
  getHtml: () => string
  getDocumentId: () => string | undefined
  getToolbar: () => { getBounds: () => DOMRect | null; focusFirstItem: () => void } | null
  onOpenLink: (href: string) => Promise<void>
  onError: (message: string) => void
}) => {
  const toolbar = shallowRef<{
    model: SelectionToolbarModel
    position: { x: number; y: number }
    revision: number
  } | null>(null)
  let target: PreviewTarget | null = null
  let frame = 0
  let revision = 0
  let disposed = false
  let pointerSelecting = false
  let dismissedRanges: Range[] | null = null

  const ownsOverlay = (element: Element | null) =>
    element?.closest<HTMLElement>('[data-editor-overlay]')?.dataset.editorOverlay ===
    `preview-${options.getDocumentId() ?? ''}`
  const ownsFocus = () => {
    const root = options.getRoot()
    const active = root?.ownerDocument.activeElement
    return Boolean(
      root?.ownerDocument.hasFocus() &&
      active &&
      (root.contains(active) || ownsOverlay(active) || active === root.ownerDocument.body),
    )
  }
  const clear = () => {
    target?.element?.classList.remove('lume-preview-selected')
    target = null
    toolbar.value = null
  }
  const dismiss = () => {
    const root = options.getRoot()
    const selection = root?.ownerDocument.getSelection() ?? null
    dismissedRanges = isPreviewTextSelection(root, selection)
      ? getSelectionRanges(selection).map((range) => range.cloneRange())
      : null
    clear()
  }
  const isCurrent = () => {
    const root = options.getRoot()
    if (
      !target ||
      target.documentId !== options.getDocumentId() ||
      target.html !== options.getHtml()
    )
      return false
    if (target.element) return target.element.isConnected && Boolean(root?.contains(target.element))
    const selection = root?.ownerDocument.getSelection() ?? null
    const ranges = getSelectionRanges(selection)
    return (
      isPreviewTextSelection(root, selection) &&
      arePreviewRangesEqual(target.ranges, ranges) &&
      target.text === ranges.map((range) => range.toString()).join('\n')
    )
  }
  const position = () => {
    const root = options.getRoot()
    if (!root || !target || !toolbar.value || !isCurrent()) {
      clear()
      return
    }
    const viewport = root.getBoundingClientRect()
    const rectangles = target.element
      ? [target.element.getBoundingClientRect()]
      : target.ranges.flatMap((range) => Array.from(range.getClientRects()))
    const anchor = pickSelectionAnchor(rectangles, viewport, target.backwards)
    if (!anchor) {
      clear()
      return
    }
    const bounds = options.getToolbar()?.getBounds() ?? { width: 220, height: 34 }
    toolbar.value = { ...toolbar.value, position: positionOverlayAroundBounds(anchor, bounds) }
  }
  const show = (
    next: PreviewTarget,
    title: string,
    ids: { id: string; label: string; disabled?: boolean }[],
  ) => {
    clear()
    target = next
    target.element?.classList.add('lume-preview-selected')
    toolbar.value = {
      model: { title, items: ids, more: [], placement: next.element ? 'object' : 'range' },
      position: { x: 8, y: 8 },
      revision: ++revision,
    }
    position()
    void nextTick(() => {
      if (!disposed) position()
    })
  }
  const captureText = () => {
    if (disposed || pointerSelecting) return
    const root = options.getRoot()
    const selection = root?.ownerDocument.getSelection() ?? null
    if (!ownsFocus()) {
      if (!target?.element) clear()
      return
    }
    if (!root || !selection || !isPreviewTextSelection(root, selection)) {
      dismissedRanges = null
      if (!target?.element) clear()
      return
    }
    const currentRanges = getSelectionRanges(selection)
    if (dismissedRanges && arePreviewRangesEqual(dismissedRanges, currentRanges)) return
    dismissedRanges = null
    const backwards = isSelectionBackwards(selection)
    if (!target?.element && target?.backwards === backwards && isCurrent()) return
    const ranges = currentRanges.map((range) => range.cloneRange())
    const text = ranges.map((range) => range.toString()).join('\n')
    if (!text) {
      if (!target?.element) clear()
      return
    }
    show(
      {
        documentId: options.getDocumentId(),
        html: options.getHtml(),
        element: null,
        ranges,
        text,
        backwards,
      },
      '只读文字',
      [{ id: 'copy', label: '复制所选文字' }],
    )
  }
  const schedule = () => {
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      captureText()
      position()
    })
  }
  const handlePointerDown = (event: PointerEvent) => {
    if (event.target instanceof Element && ownsOverlay(event.target)) return
    dismissedRanges = null
    pointerSelecting =
      event.button === 0 &&
      event.target instanceof Node &&
      Boolean(options.getRoot()?.contains(event.target))
    clear()
  }
  const handlePointerUp = () => {
    if (!pointerSelecting) return
    pointerSelecting = false
    schedule()
  }
  const handleSelectionChange = () => {
    if (pointerSelecting) return
    if (target && !target.element && !isCurrent()) clear()
    schedule()
  }
  const handleClick = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null
    if (!element) return
    const anchor = element.closest<HTMLAnchorElement>('a')
    if (anchor) event.preventDefault()
    const selection = options.getRoot()?.ownerDocument.getSelection()
    if (isPreviewTextSelection(options.getRoot(), selection ?? null)) {
      captureText()
      return
    }
    const object = anchor ?? element.closest<HTMLElement>('img, pre, .katex, .lume-mermaid')
    if (!object) return
    const href = anchor?.getAttribute('href') ?? undefined
    const text = anchor
      ? (href ?? '')
      : object instanceof HTMLImageElement
        ? (object.getAttribute('src') ?? '')
        : object.classList.contains('katex')
          ? (object.querySelector('annotation')?.textContent ?? '')
          : object.classList.contains('lume-mermaid')
            ? decodeURIComponent(object.dataset.copySource ?? object.dataset.mermaidSource ?? '')
            : (object.querySelector('code')?.textContent ?? object.textContent ?? '')
    const title = anchor
      ? '只读链接'
      : object instanceof HTMLImageElement
        ? '只读图片'
        : object.classList.contains('katex')
          ? '只读公式'
          : object.classList.contains('lume-mermaid')
            ? '只读图表'
            : '只读代码'
    const ids = anchor
      ? [
          { id: 'openLink', label: '打开链接', disabled: !canOpenEditorLink(href ?? '') },
          { id: 'copyLink', label: '复制链接地址' },
        ]
      : [
          {
            id: 'copy',
            label:
              object instanceof HTMLImageElement
                ? '复制图片地址'
                : object.classList.contains('katex')
                  ? '复制公式源码'
                  : '复制整块代码',
          },
        ]
    show(
      {
        documentId: options.getDocumentId(),
        html: options.getHtml(),
        element: object,
        ranges: [],
        text,
        backwards: false,
        href,
      },
      title,
      ids,
    )
    if (anchor && href && canOpenEditorLink(href))
      void options
        .onOpenLink(href)
        .catch((error: unknown) =>
          options.onError(error instanceof Error ? error.message : '无法打开链接。'),
        )
  }
  const handleAction = async (id: string) => {
    if (!isCurrent() || !target) {
      clear()
      return
    }
    try {
      if (id === 'openLink' && target.href && canOpenEditorLink(target.href))
        await options.onOpenLink(target.href)
      else if (id === 'copy' || id === 'copyLink') await navigator.clipboard.writeText(target.text)
    } catch (error) {
      options.onError(error instanceof Error ? error.message : '无法完成预览操作。')
    }
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.altKey && event.key === 'F10' && ownsFocus() && toolbar.value && isCurrent()) {
      event.preventDefault()
      options.getToolbar()?.focusFirstItem()
    } else if (event.key === 'Escape') dismiss()
  }
  const handleFocus = () => {
    const root = options.getRoot()
    const active = root?.ownerDocument.activeElement
    if (
      active &&
      active !== root?.ownerDocument.body &&
      !root?.contains(active) &&
      !ownsOverlay(active)
    )
      clear()
  }
  const handleWindowBlur = () => {
    pointerSelecting = false
    clear()
  }

  watch([options.getHtml, options.getDocumentId], () => {
    dismissedRanges = null
    clear()
  })
  onMounted(() => {
    const root = options.getRoot()
    root?.addEventListener('click', handleClick)
    root?.addEventListener('scroll', position)
    root?.addEventListener('keyup', captureText)
    root?.addEventListener('load', position, true)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerUp, true)
    window.addEventListener('resize', position)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('blur', handleWindowBlur)
    root?.ownerDocument.addEventListener('focusin', handleFocus)
    root?.ownerDocument.addEventListener('selectionchange', handleSelectionChange)
  })
  onBeforeUnmount(() => {
    disposed = true
    cancelAnimationFrame(frame)
    const root = options.getRoot()
    root?.removeEventListener('click', handleClick)
    root?.removeEventListener('scroll', position)
    root?.removeEventListener('keyup', captureText)
    root?.removeEventListener('load', position, true)
    window.removeEventListener('pointerdown', handlePointerDown, true)
    window.removeEventListener('pointerup', handlePointerUp, true)
    window.removeEventListener('pointercancel', handlePointerUp, true)
    window.removeEventListener('resize', position)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('blur', handleWindowBlur)
    root?.ownerDocument.removeEventListener('focusin', handleFocus)
    root?.ownerDocument.removeEventListener('selectionchange', handleSelectionChange)
    clear()
  })
  return { toolbar, handleAction, dismiss, refresh: position }
}

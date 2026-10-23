import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { EditorView } from '@milkdown/kit/prose/view'
import { positionOverlayAroundBounds } from '../overlays/overlayPosition'
import {
  captureSelectionContext,
  restoreEditorContext,
  type EditorContext,
} from './selectionContext'
import { getSelectionAnchor } from './selectionGeometry'
import { getSelectionToolbarModel, type SelectionToolbarModel } from './selectionToolbarItems'

interface ToolbarState {
  context: EditorContext
  model: SelectionToolbarModel
  position: { x: number; y: number }
  revision: number
}

const IMAGE_TOOLBAR_DELAY = 200

export const useSelectionToolbar = (options: {
  getRoot: () => HTMLElement | null
  getToolbar: () => {
    getElement: () => HTMLElement | null
    getBounds: () => DOMRect | null
    focusFirstItem: () => void
  } | null
  overlayId: string
  isActive: () => boolean
  isSuspended: () => boolean
  onAction: (id: string, context: EditorContext) => void
  onCloseMenus: () => void
}) => {
  const toolbar = shallowRef<ToolbarState | null>(null)
  let view: EditorView | null = null
  let phase: 'idle' | 'pointer' | 'composition' = 'idle'
  let dismissed: EditorContext | null = null
  let frame = 0
  let revision = 0
  let disposed = false
  let resizeObserver: ResizeObserver | null = null
  let observedToolbar: HTMLElement | null = null
  let imagePointerDown = false
  let imageToolbarReadyAt = 0
  let imageToolbarTimer: ReturnType<typeof setTimeout> | undefined
  let windowBlurred = false

  const ownsOverlay = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest<HTMLElement>('[data-editor-overlay]')?.dataset.editorOverlay ===
      options.overlayId
  const isEditorTarget = (target: EventTarget | null) =>
    target instanceof Node && Boolean(options.getRoot()?.contains(target))
  const isCurrentSelection = (context: EditorContext) =>
    Boolean(
      view &&
      context.doc === view.state.doc &&
      context.selection.eq(view.state.selection) &&
      (!context.nativeCode ||
        context.nativeCode.state.selection.eq(context.nativeCode.view.state.selection)),
    )
  const hide = () => {
    clearTimeout(imageToolbarTimer)
    imageToolbarTimer = undefined
    if (observedToolbar) resizeObserver?.unobserve(observedToolbar)
    observedToolbar = null
    toolbar.value = null
  }
  const dismiss = (focus = false) => {
    const target = toolbar.value?.context
    dismissed = view ? captureSelectionContext(view) : null
    hide()
    if (focus && view && target && options.isActive() && restoreEditorContext(view, target)) {
      if (target.nativeCode) target.nativeCode.view.focus()
      else view.focus()
    }
  }
  const position = () => {
    const current = toolbar.value
    const root = options.getRoot()
    if (!view || !root || !current || current.context.doc !== view.state.doc) return
    const pane =
      root.closest('.lume-wysiwyg-pane')?.getBoundingClientRect() ?? root.getBoundingClientRect()
    const viewport = {
      top: Math.max(0, pane.top),
      left: Math.max(0, pane.left),
      right: Math.min(window.innerWidth, pane.right),
      bottom: Math.min(window.innerHeight, pane.bottom),
    }
    const anchor = getSelectionAnchor(
      view,
      current.context,
      viewport,
      current.model.placement === 'block',
    )
    if (!anchor) {
      hide()
      return
    }
    const bounds = options.getToolbar()?.getBounds()
    const size = bounds ?? { width: Math.min(420, window.innerWidth - 16), height: 34 }
    const next = positionOverlayAroundBounds(anchor, size)
    if (current.position.x !== next.x || current.position.y !== next.y)
      toolbar.value = { ...current, position: next }
  }
  const refresh = () => {
    if (disposed || windowBlurred || !view || view.isDestroyed || !options.isActive()) {
      hide()
      return
    }
    const active = view.dom.ownerDocument.activeElement
    if (
      phase !== 'idle' ||
      (active instanceof Element &&
        Boolean(active.closest('.lume-footnote-source, .lume-image-path'))) ||
      view.composing ||
      options.isSuspended() ||
      (!isEditorTarget(active) && !ownsOverlay(active))
    ) {
      hide()
      return
    }
    if (dismissed && isCurrentSelection(dismissed)) {
      hide()
      return
    }
    dismissed = null
    const previous = toolbar.value
    const context = captureSelectionContext(view)
    const model = getSelectionToolbarModel(context, view.state, view.editable)
    if (!model) {
      hide()
      return
    }
    // 图片单击先等待双击判定，期间进入源码或移开焦点就取消工具栏。
    const delay = imageToolbarReadyAt - performance.now()
    if (context.target === 'image' && delay > 0) {
      hide()
      imageToolbarTimer = setTimeout(() => {
        imageToolbarTimer = undefined
        schedule()
      }, delay)
      return
    }
    if (
      !previous ||
      previous.context.doc !== context.doc ||
      !previous.context.selection.eq(context.selection) ||
      (previous.context.nativeCode &&
        context.nativeCode &&
        !previous.context.nativeCode.state.selection.eq(context.nativeCode.state.selection))
    )
      revision += 1
    toolbar.value = { context, model, position: previous?.position ?? { x: 8, y: 8 }, revision }
    position()
    void nextTick(() => {
      if (disposed) return
      const element = options.getToolbar()?.getElement()
      if (element !== observedToolbar) {
        if (observedToolbar) resizeObserver?.unobserve(observedToolbar)
        if (element) resizeObserver?.observe(element)
        observedToolbar = element ?? null
      }
      position()
    })
  }
  const schedule = (nextView?: EditorView | null) => {
    if (nextView) view = nextView
    // 选区变更后立即撤下旧快照，避免下一帧刷新前的点击恢复旧选区。
    if (toolbar.value && !isCurrentSelection(toolbar.value.context)) hide()
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      refresh()
    })
  }
  const handleAction = (id: string) => {
    const target = toolbar.value?.context
    if (!view || !target || !options.isActive() || !restoreEditorContext(view, target)) {
      hide()
      return
    }
    options.onAction(id, target)
    schedule()
  }
  const handlePointerDown = (event: PointerEvent) => {
    if (ownsOverlay(event.target)) return
    imagePointerDown = false
    imageToolbarReadyAt = 0
    options.onCloseMenus()
    if (
      !isEditorTarget(event.target) ||
      (view && event.target instanceof Node && !view.dom.contains(event.target))
    ) {
      dismiss()
      return
    }
    if (event.button !== 0) {
      hide()
      return
    }
    phase = 'pointer'
    dismissed = null
    if (event.target instanceof HTMLElement && event.target.closest('.lume-task-checkbox'))
      dismiss()
    else hide()
    imagePointerDown =
      event.target instanceof Element &&
      Boolean(event.target.closest('.lume-image-resizer')) &&
      !event.target.closest('.lume-image-path, .lume-image-resizer__handle')
  }
  const handlePointerUp = (event: PointerEvent) => {
    if (phase === 'pointer' && imagePointerDown && event.type === 'pointerup')
      imageToolbarReadyAt = performance.now() + IMAGE_TOOLBAR_DELAY
    imagePointerDown = false
    if (phase === 'pointer') phase = 'idle'
    schedule()
  }
  const handleCompositionStart = () => {
    phase = 'composition'
    hide()
  }
  const handleCompositionEnd = () => {
    phase = 'idle'
    schedule()
  }
  const handleInput = () => {
    hide()
    schedule()
  }
  const handleFocusOut = () => {
    schedule()
  }
  const handleWindowBlur = () => {
    windowBlurred = true
    imagePointerDown = false
    imageToolbarReadyAt = 0
    hide()
  }
  const handleWindowFocus = () => {
    windowBlurred = false
    schedule()
  }
  const handleLayout = () => {
    schedule()
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (!isEditorTarget(event.target) && !ownsOverlay(event.target)) return
    const pendingImageToolbar = imageToolbarTimer !== undefined
    imageToolbarReadyAt = 0
    if (event.altKey && event.key === 'F10' && toolbar.value) {
      event.preventDefault()
      options.getToolbar()?.focusFirstItem()
      return
    }
    if (event.key === 'Escape' && (toolbar.value || pendingImageToolbar)) {
      event.preventDefault()
      dismiss(true)
      return
    }
    if (pendingImageToolbar) schedule()
  }

  watch(options.isSuspended, () => schedule())
  onMounted(() => {
    const root = options.getRoot()
    if (!root) return
    resizeObserver = new ResizeObserver(handleLayout)
    resizeObserver.observe(root.parentElement ?? root)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerUp, true)
    window.addEventListener('scroll', handleLayout, true)
    window.addEventListener('resize', handleLayout)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('keydown', handleKeydown)
    root.addEventListener('compositionstart', handleCompositionStart, true)
    root.addEventListener('compositionend', handleCompositionEnd, true)
    root.addEventListener('beforeinput', handleInput, true)
    root.ownerDocument.addEventListener('selectionchange', handleLayout)
    root.ownerDocument.addEventListener('focusin', handleFocusOut)
  })
  onBeforeUnmount(() => {
    disposed = true
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    const root = options.getRoot()
    window.removeEventListener('pointerdown', handlePointerDown, true)
    window.removeEventListener('pointerup', handlePointerUp, true)
    window.removeEventListener('pointercancel', handlePointerUp, true)
    window.removeEventListener('scroll', handleLayout, true)
    window.removeEventListener('resize', handleLayout)
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('keydown', handleKeydown)
    root?.removeEventListener('compositionstart', handleCompositionStart, true)
    root?.removeEventListener('compositionend', handleCompositionEnd, true)
    root?.removeEventListener('beforeinput', handleInput, true)
    root?.ownerDocument.removeEventListener('selectionchange', handleLayout)
    root?.ownerDocument.removeEventListener('focusin', handleFocusOut)
    hide()
  })
  return { toolbar, schedule, hide, dismiss, handleAction }
}

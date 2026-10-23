import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { EditorView } from '@milkdown/kit/prose/view'
import { positionOverlayAroundBounds } from '../overlays/overlayPosition'
import { captureSelectionContext, type EditorContext } from './selectionContext'
import { getSelectionAnchor } from './selectionGeometry'
import { getSelectionToolbarModel, type SelectionToolbarModel } from './selectionToolbarItems'

interface ToolbarState {
  context: EditorContext
  model: SelectionToolbarModel
  position: { x: number; y: number }
  revision: number
}

const IMAGE_TOOLBAR_DELAY = 200
const SELECTION_TOOLBAR_DELAY = 100

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
  let phase: 'idle' | 'pointer' | 'drag' | 'composition' = 'idle'
  let dismissed: EditorContext | null = null
  let frame = 0
  let revision = 0
  let disposed = false
  let resizeObserver: ResizeObserver | null = null
  let observedToolbar: HTMLElement | null = null
  let imagePointerDown = false
  let toolbarReadyAt = 0
  let toolbarDelayTarget: 'image' | 'selection' = 'selection'
  let toolbarTimer: ReturnType<typeof setTimeout> | undefined
  let windowBlurred = false

  const ownsOverlay = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest<HTMLElement>('[data-editor-overlay]')?.dataset.editorOverlay ===
      options.overlayId
  const isEditorTarget = (target: EventTarget | null) =>
    target instanceof Node && Boolean(options.getRoot()?.contains(target))
  const hasSameSelection = (context: EditorContext) =>
    Boolean(
      view &&
      context.selection.eq(view.state.selection) &&
      (!context.nativeCode ||
        (context.nativeCode.state.doc === context.nativeCode.view.state.doc &&
          context.nativeCode.state.selection.eq(context.nativeCode.view.state.selection))),
    )
  const isCurrentSelection = (context: EditorContext) =>
    context.doc === view?.state.doc && hasSameSelection(context)
  const matchesDOMSelection = (context: EditorContext) => {
    if (context.nativeCode || !['text', 'all'].includes(context.kind ?? '')) return true
    const selection = view?.dom.ownerDocument.getSelection()
    if (!view || !selection?.anchorNode || !selection.focusNode) return false
    try {
      return (
        view.posAtDOM(selection.anchorNode, selection.anchorOffset) === context.selection.anchor &&
        view.posAtDOM(selection.focusNode, selection.focusOffset) === context.selection.head
      )
    } catch {
      return false
    }
  }
  const hide = () => {
    clearTimeout(toolbarTimer)
    toolbarTimer = undefined
    if (observedToolbar) resizeObserver?.unobserve(observedToolbar)
    observedToolbar = null
    toolbar.value = null
  }
  const dismiss = (focus = false) => {
    const target = toolbar.value?.context
    dismissed = view ? captureSelectionContext(view) : null
    hide()
    if (
      focus &&
      view &&
      target &&
      options.isActive() &&
      isCurrentSelection(target) &&
      matchesDOMSelection(target)
    ) {
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
    if (!model || !matchesDOMSelection(context)) {
      hide()
      return
    }
    // 松手后等待选区同步完成；图片额外保留双击判定时间。
    const delay = toolbarReadyAt - performance.now()
    if (delay > 0 && (toolbarDelayTarget !== 'image' || context.target === 'image')) {
      hide()
      toolbarTimer = setTimeout(() => {
        toolbarTimer = undefined
        schedule()
      }, delay)
      return
    }
    clearTimeout(toolbarTimer)
    toolbarTimer = undefined
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
    // 选区变化时撤下旧工具栏；同一选区的格式修改直接更新，避免反复卸载。
    if (toolbar.value && !hasSameSelection(toolbar.value.context)) hide()
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      refresh()
    })
  }
  const handleAction = (id: string) => {
    const target = toolbar.value?.context
    if (
      !view ||
      !target ||
      !options.isActive() ||
      !isCurrentSelection(target) ||
      !matchesDOMSelection(target)
    ) {
      hide()
      return
    }
    options.onAction(id, target)
    schedule()
  }
  const handlePointerDown = (event: PointerEvent) => {
    if (ownsOverlay(event.target)) return
    imagePointerDown = false
    toolbarReadyAt = 0
    options.onCloseMenus()
    if (!isEditorTarget(event.target)) {
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
    if (event.type === 'pointercancel') {
      imagePointerDown = false
      if (phase === 'drag') {
        hide()
        return
      }
      phase = 'idle'
      dismiss()
      return
    }
    if (phase === 'pointer' && event.type === 'pointerup') {
      toolbarDelayTarget = imagePointerDown ? 'image' : 'selection'
      toolbarReadyAt =
        performance.now() + (imagePointerDown ? IMAGE_TOOLBAR_DELAY : SELECTION_TOOLBAR_DELAY)
    }
    imagePointerDown = false
    if (phase === 'pointer') phase = 'idle'
    schedule()
  }
  const handleDragStart = (event: DragEvent) => {
    if (!isEditorTarget(event.target)) return
    phase = 'drag'
    dismissed = null
    hide()
  }
  const handleDragEnd = () => {
    if (phase !== 'drag') return
    phase = 'idle'
    toolbarDelayTarget = 'selection'
    toolbarReadyAt = performance.now() + SELECTION_TOOLBAR_DELAY
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
    phase = 'idle'
    imagePointerDown = false
    toolbarReadyAt = 0
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
    const pendingToolbar = toolbarTimer !== undefined
    toolbarReadyAt = 0
    if (event.altKey && event.key === 'F10' && toolbar.value) {
      event.preventDefault()
      options.getToolbar()?.focusFirstItem()
      return
    }
    if (event.key === 'Escape' && (toolbar.value || pendingToolbar)) {
      event.preventDefault()
      dismiss(true)
      return
    }
    if (pendingToolbar) schedule()
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
    window.addEventListener('dragstart', handleDragStart, true)
    window.addEventListener('dragend', handleDragEnd, true)
    window.addEventListener('drop', handleDragEnd, true)
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
    window.removeEventListener('dragstart', handleDragStart, true)
    window.removeEventListener('dragend', handleDragEnd, true)
    window.removeEventListener('drop', handleDragEnd, true)
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

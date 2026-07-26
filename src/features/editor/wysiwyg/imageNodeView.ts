import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import {
  MIN_IMAGE_ZOOM,
  clampImageZoom,
  type ImageAlign,
} from '@/utils/imageHtml'
import { sizedImageSchema } from './imageSchema'

export function createImageNodeView(options: {
  onSelect: (view: EditorView, selection: NodeSelection) => void
  resolveImageSource: (src: string) => string | Promise<string>
}) {
  return $view(sizedImageSchema.node, () => (
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

      const source = options.resolveImageSource(src)
      if (typeof source === 'string') {
        imageElement.src = source
        return
      }

      imageElement.removeAttribute('src')
      void source.then((resolvedSource) => {
        if (sequence === loadSequence) imageElement.src = resolvedSource
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
      if (selection instanceof NodeSelection) options.onSelect(view, selection)
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
}
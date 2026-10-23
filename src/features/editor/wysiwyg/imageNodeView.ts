import { language, t } from '@/app/i18n'
import { watch } from 'vue'
import type { ImageInputAttributes } from './imageInput'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection } from '@milkdown/kit/prose/state'
import { closeHistory } from '@milkdown/kit/prose/history'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import {
  MIN_IMAGE_ZOOM,
  clampImageZoom,
  normalizeImageDimension,
  normalizeImageZoom,
} from '@/utils/imageHtml'
import { sizedImageSchema } from './imageSchema'
import { createImagePathEditor } from './imagePathEditor'
import './imagePathEditor.css'

export function createImageNodeView(options: {
  onSelect: (view: EditorView, selection: NodeSelection) => void
  resolveImageSource: (src: string) => string | Promise<string>
  importImageSource?: (src: string) => Promise<string>
  selectImages?: () => Promise<ImageInputAttributes[]>
}) {
  return $view(
    sizedImageSchema.node,
    () => (node: ProseNode, view: EditorView, getPos: () => number | undefined) => {
      const dom = document.createElement('span')
      const preview = document.createElement('span')
      const imageElement = document.createElement('img')
      const resizeHandle = document.createElement('span')
      let currentNode = node
      let currentZoom = 100
      let resizeZoom: number | null = null
      let currentSource: string | null = null
      let destroyed = false
      let loadSequence = 0
      let resizeCleanup: (() => void) | null = null
      let animationFrame: number | null = null
      let observedParent: HTMLElement | null = null
      const pathEditor = createImagePathEditor({
        view,
        getPos,
        importSource: options.importImageSource,
        selectImages: options.selectImages,
        onUpdate: () => updateImage(currentNode),
      })

      dom.className = 'lume-image-resizer'
      dom.contentEditable = 'false'
      preview.className = 'lume-image-resizer__preview'
      imageElement.draggable = false
      resizeHandle.className = 'lume-image-resizer__handle'
      resizeHandle.title = t('拖动调整图片大小')
      const stopLanguageWatch = watch(language, () => {
        resizeHandle.title = t('拖动调整图片大小')
      })
      preview.append(imageElement, resizeHandle)
      dom.append(pathEditor.dom, preview)

      const applyZoom = () => {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        animationFrame = null
        if (destroyed || preview.hidden) return
        if (dom.parentElement && dom.parentElement !== observedParent) {
          if (observedParent) resizeObserver.unobserve(observedParent)
          observedParent = dom.parentElement
          resizeObserver.observe(observedParent)
        }
        const parentWidth = dom.parentElement?.getBoundingClientRect().width ?? 0
        const width = normalizeImageDimension(currentNode.attrs.width)
        const height = normalizeImageDimension(currentNode.attrs.height)
        const hasWidth = Boolean(width && width !== 'auto')
        const hasHeight = Boolean(height && height !== 'auto')
        // 容器高度也会随拖拽变化；布局刷新必须沿用预览比例，不能回写尚未提交的旧比例。
        const scale = (resizeZoom ?? currentZoom) / 100
        // 只缩放图片预览，源码区域保持正常字号和输入尺寸。
        preview.style.zoom = String(scale)
        preview.style.maxWidth = parentWidth ? `${parentWidth / scale}px` : `${100 / scale}%`
        preview.style.width =
          width.endsWith('%') && parentWidth
            ? `${(parentWidth * Number.parseFloat(width)) / 100}px`
            : hasWidth
              ? width
              : !hasHeight && imageElement.naturalWidth
                ? `${imageElement.naturalWidth}px`
                : ''
        imageElement.style.width = !hasWidth && hasHeight ? 'auto' : '100%'
        imageElement.style.height = height || 'auto'
      }

      const scheduleZoom = () => {
        if (destroyed) return
        if (animationFrame !== null) cancelAnimationFrame(animationFrame)
        animationFrame = requestAnimationFrame(applyZoom)
      }
      const resizeObserver = new ResizeObserver(scheduleZoom)

      const updateImage = (updatedNode: ProseNode, force = false) => {
        if (
          resizeCleanup &&
          ['src', 'width', 'height', 'zoom', 'align'].some(
            (attribute) => updatedNode.attrs[attribute] !== currentNode.attrs[attribute],
          )
        )
          resizeCleanup()
        currentNode = updatedNode
        const { src, alt, title, zoom, align } = updatedNode.attrs
        const currentAlign = ['left', 'center', 'right'].includes(align) ? align : 'auto'
        currentZoom = normalizeImageZoom(zoom)
        dom.dataset.align = currentAlign
        imageElement.alt = alt || ''
        imageElement.title = title || ''
        if (pathEditor.update(updatedNode)) dom.dataset.pathEditor = 'true'
        else delete dom.dataset.pathEditor
        preview.hidden = !src
        if (!src) {
          delete dom.dataset.error
          currentSource = null
          loadSequence++
          imageElement.removeAttribute('src')
          return
        }
        scheduleZoom()

        if (!force && src === currentSource) return
        currentSource = src
        const sequence = ++loadSequence
        imageElement.classList.remove('lume-image--error')
        delete dom.dataset.error

        let source: string | Promise<string>
        try {
          source = options.resolveImageSource(src)
        } catch (error) {
          imageElement.removeAttribute('src')
          imageElement.classList.add('lume-image--error')
          dom.dataset.error = 'true'
          console.warn(`无法加载本地图片 ${src}:`, error)
          return
        }
        if (typeof source === 'string') {
          imageElement.src = source
          return
        }

        imageElement.removeAttribute('src')
        void source
          .then((resolvedSource) => {
            if (!destroyed && sequence === loadSequence) imageElement.src = resolvedSource
          })
          .catch((error) => {
            if (!destroyed && sequence === loadSequence) {
              imageElement.classList.add('lume-image--error')
              dom.dataset.error = 'true'
            }
            console.warn(`无法加载本地图片 ${src}:`, error)
          })
      }

      const handleImageRefresh = () => updateImage(currentNode, true)
      const handleEditImage = () => pathEditor.focus()

      const handleResizeStart = (event: PointerEvent) => {
        if (event.button !== 0 || !view.editable || destroyed) return
        event.preventDefault()
        event.stopPropagation()
        resizeCleanup?.()
        applyZoom()

        const startX = event.clientX
        const startWidth = preview.getBoundingClientRect().width
        const previousMaxWidth = preview.style.maxWidth
        preview.style.maxWidth = 'none'
        const baseWidth = preview.getBoundingClientRect().width / (currentZoom / 100)
        preview.style.maxWidth = previousMaxWidth
        if (!baseWidth) return
        const parentWidth = dom.parentElement?.getBoundingClientRect().width ?? startWidth
        let nextZoom = currentZoom
        resizeZoom = currentZoom

        const handlePointerMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return
          const width = Math.min(
            parentWidth,
            Math.max((baseWidth * MIN_IMAGE_ZOOM) / 100, startWidth + moveEvent.clientX - startX),
          )
          nextZoom = clampImageZoom((width / baseWidth) * 100)
          resizeZoom = nextZoom
          scheduleZoom()
        }

        const finishResize = (finishEvent: PointerEvent) => {
          if (finishEvent.pointerId !== event.pointerId) return
          resizeCleanup?.()
          const pos = getPos()
          if (
            finishEvent.type === 'pointercancel' ||
            typeof pos !== 'number' ||
            nextZoom === currentZoom ||
            !view.editable
          ) {
            applyZoom()
            return
          }
          // 仅修改比例，保留图片对象选区；松手时不额外滚动页面。
          view.dispatch(closeHistory(view.state.tr.setNodeAttribute(pos, 'zoom', nextZoom)))
        }

        const cancelResize = () => {
          resizeCleanup?.()
          applyZoom()
        }
        resizeCleanup = () => {
          resizeZoom = null
          resizeCleanup = null
          window.removeEventListener('pointermove', handlePointerMove)
          window.removeEventListener('pointerup', finishResize)
          window.removeEventListener('pointercancel', finishResize)
          window.removeEventListener('blur', cancelResize)
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', finishResize)
        window.addEventListener('pointercancel', finishResize)
        window.addEventListener('blur', cancelResize)
      }

      const getImagePos = () => {
        const pos = getPos()
        return typeof pos === 'number' ? pos : view.posAtDOM(dom, 0)
      }

      const selectImage = (event: MouseEvent | PointerEvent) => {
        if (pathEditor.contains(event.target)) return
        if (event.target instanceof Node && resizeHandle.contains(event.target)) return
        if (event.button !== 0) return
        const pos = getImagePos()
        event.preventDefault()
        event.stopPropagation()
        view.dispatch(
          view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView(),
        )
        view.focus()
        const selection = view.state.selection
        if (selection instanceof NodeSelection) options.onSelect(view, selection)
      }

      const handleDoubleClick = (event: MouseEvent) => {
        if (
          destroyed ||
          !view.editable ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          pathEditor.contains(event.target) ||
          (event.target instanceof Node && resizeHandle.contains(event.target))
        )
          return
        event.preventDefault()
        event.stopPropagation()
        pathEditor.focus()
      }

      dom.addEventListener('pointerdown', selectImage)
      dom.addEventListener('mousedown', selectImage)
      dom.addEventListener('dblclick', handleDoubleClick)
      imageElement.addEventListener('load', () => {
        if (preview.hidden) return
        imageElement.classList.remove('lume-image--error')
        delete dom.dataset.error
        scheduleZoom()
      })
      imageElement.addEventListener('error', () => {
        if (preview.hidden) return
        imageElement.classList.add('lume-image--error')
        dom.dataset.error = 'true'
      })
      resizeHandle.addEventListener('pointerdown', handleResizeStart)
      window.addEventListener('resize', scheduleZoom)
      view.dom.addEventListener('lume:image-refresh', handleImageRefresh)
      dom.addEventListener('lume-edit-image', handleEditImage)
      updateImage(node)
      // 仅创建占位节点时自动进入路径，后续文字选区不再被对象选择抢走。
      if (!node.attrs.src)
        queueMicrotask(() => {
          if (
            !destroyed &&
            view.state.selection instanceof NodeSelection &&
            view.state.selection.from === getPos()
          )
            pathEditor.focus()
        })
      return {
        dom,
        selectNode() {
          dom.classList.add('ProseMirror-selectednode')
        },
        deselectNode() {
          dom.classList.remove('ProseMirror-selectednode')
        },
        stopEvent(event: Event) {
          return (
            pathEditor.contains(event.target) ||
            event.type === 'mousedown' ||
            event.type === 'pointerdown' ||
            event.type === 'dblclick'
          )
        },
        ignoreMutation(mutation: { type: string }) {
          return dom.dataset.pathEditor === 'true' || mutation.type !== 'selection'
        },
        update(updatedNode: ProseNode) {
          if (updatedNode.type !== currentNode.type) return false
          updateImage(updatedNode)
          return true
        },
        destroy() {
          stopLanguageWatch()
          destroyed = true
          loadSequence++
          resizeCleanup?.()
          pathEditor.destroy()
          resizeObserver.disconnect()
          if (animationFrame !== null) cancelAnimationFrame(animationFrame)
          window.removeEventListener('resize', scheduleZoom)
          view.dom.removeEventListener('lume:image-refresh', handleImageRefresh)
          dom.removeEventListener('lume-edit-image', handleEditImage)
          dom.removeEventListener('dblclick', handleDoubleClick)
        },
      }
    },
  )
}

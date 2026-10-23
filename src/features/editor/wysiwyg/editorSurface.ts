import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

export const bindEditorSurface = (view: EditorView, root: HTMLElement) => {
  const ownerDocument = view.dom.ownerDocument
  let stopDragging: (() => void) | undefined

  const positionAt = (event: MouseEvent) => {
    const bounds = view.dom.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return null
    // 外层留白也映射到正文边缘，右侧对应行尾、左侧对应行首。
    return view.posAtCoords({
      left: Math.max(bounds.left + 1, Math.min(event.clientX, bounds.right - 1)),
      top: Math.max(bounds.top + 1, Math.min(event.clientY, bounds.bottom - 1)),
    })
  }
  const handleMouseDown = (event: MouseEvent) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      view.isDestroyed ||
      view.composing ||
      (event.target !== root && event.target !== view.dom.parentElement)
    )
      return
    const hit = positionAt(event)
    if (!hit) return
    event.preventDefault()
    stopDragging?.()
    const position = view.state.doc.resolve(hit.pos)
    const selection = event.shiftKey
      ? TextSelection.between(view.state.selection.$anchor, position)
      : TextSelection.near(position)
    view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true))
    view.focus()
    const doc = view.state.doc
    const anchor = view.state.selection.$anchor

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (view.isDestroyed || view.state.doc !== doc || moveEvent.buttons !== 1) {
        stopDragging?.()
        return
      }
      const next = positionAt(moveEvent)
      if (!next) return
      const selection = TextSelection.between(anchor, doc.resolve(next.pos))
      if (!selection.eq(view.state.selection))
        view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true))
    }
    stopDragging = () => {
      ownerDocument.removeEventListener('mousemove', handleMouseMove, true)
      ownerDocument.removeEventListener('mouseup', handleMouseUp, true)
      ownerDocument.defaultView?.removeEventListener('blur', handleMouseUp)
      stopDragging = undefined
    }
    const handleMouseUp = () => stopDragging?.()
    ownerDocument.addEventListener('mousemove', handleMouseMove, true)
    ownerDocument.addEventListener('mouseup', handleMouseUp, true)
    ownerDocument.defaultView?.addEventListener('blur', handleMouseUp)
  }

  root.addEventListener('mousedown', handleMouseDown)
  return () => {
    stopDragging?.()
    root.removeEventListener('mousedown', handleMouseDown)
  }
}

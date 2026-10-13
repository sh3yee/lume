import type { EditorView } from '@milkdown/kit/prose/view'
import type { EditorContext } from './selectionContext'
import { CellSelection } from '@milkdown/kit/prose/tables'

export interface SelectionBounds {
  top: number
  right: number
  bottom: number
  left: number
}

export const clipSelectionBounds = (
  bounds: SelectionBounds,
  viewport: SelectionBounds,
): SelectionBounds | null => {
  const clipped = {
    top: Math.max(bounds.top, viewport.top),
    right: Math.min(bounds.right, viewport.right),
    bottom: Math.min(bounds.bottom, viewport.bottom),
    left: Math.max(bounds.left, viewport.left),
  }
  return clipped.bottom > clipped.top && clipped.right >= clipped.left ? clipped : null
}

export const pickSelectionAnchor = (
  rectangles: SelectionBounds[],
  viewport: SelectionBounds,
  backwards: boolean,
) => {
  const visible = rectangles
    .map((rect) => clipSelectionBounds(rect, viewport))
    .filter((rect): rect is SelectionBounds => rect !== null)
  return (backwards ? visible[0] : visible.at(-1)) ?? null
}

export const getSelectionAnchor = (
  view: EditorView,
  context: EditorContext,
  viewport: SelectionBounds,
  blockControl: boolean,
) => {
  if (context.nativeCode) {
    const code = context.nativeCode.view
    const main = code.state.selection.main
    for (const range of [main, ...code.state.selection.ranges.filter((range) => range !== main)]) {
      const rectangles: SelectionBounds[] = []
      for (const visible of code.visibleRanges) {
        if (range.to < visible.from || range.from > visible.to) continue
        const pos = Math.max(visible.from, Math.min(range.head, visible.to))
        const rect = code.coordsAtPos(pos)
        if (rect) rectangles.push(rect)
      }
      const anchor = pickSelectionAnchor(rectangles, viewport, range.head < range.anchor)
      if (anchor) return anchor
    }
    return null
  }
  if (context.node && context.kind === 'node') {
    const dom = view.nodeDOM(context.node.pos)
    return dom instanceof HTMLElement
      ? clipSelectionBounds(dom.getBoundingClientRect(), viewport)
      : null
  }
  if (blockControl) {
    const { $from } = context.selection
    let depth = $from.depth
    if (context.containers.includes('table'))
      while (depth && $from.node(depth).type.name !== 'table') depth -= 1
    const dom = depth ? view.nodeDOM($from.before(depth)) : null
    return dom instanceof HTMLElement
      ? clipSelectionBounds(dom.getBoundingClientRect(), viewport)
      : null
  }
  if (context.kind === 'cells') {
    const selection = context.selection
    if (selection instanceof CellSelection) {
      const cell = view.nodeDOM(selection.$headCell.pos)
      const anchor =
        cell instanceof HTMLElement
          ? clipSelectionBounds(cell.getBoundingClientRect(), viewport)
          : null
      if (anchor) return anchor
      return pickSelectionAnchor(
        Array.from(view.dom.querySelectorAll('.selectedCell'), (cell) =>
          cell.getBoundingClientRect(),
        ),
        viewport,
        selection.$headCell.pos < selection.$anchorCell.pos,
      )
    }
    return null
  }
  if (context.target === 'all') {
    const bounds = clipSelectionBounds(view.dom.getBoundingClientRect(), viewport)
    return bounds ? { ...bounds, top: Math.max(bounds.top, bounds.bottom - 24) } : null
  }
  try {
    const from = view.domAtPos(
      context.link && context.selection.empty ? context.link.from : context.selection.from,
    )
    const to = view.domAtPos(
      context.link && context.selection.empty ? context.link.to : context.selection.to,
    )
    const range = view.dom.ownerDocument.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    return pickSelectionAnchor(
      Array.from(range.getClientRects()),
      viewport,
      context.selection.head < context.selection.anchor,
    )
  } catch {
    return null
  }
}

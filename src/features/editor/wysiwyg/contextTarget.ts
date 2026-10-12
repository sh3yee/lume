import type { Node, Mark } from '@milkdown/kit/prose/model'
import { NodeSelection, TextSelection, type Selection } from '@milkdown/kit/prose/state'
import { CellSelection } from '@milkdown/kit/prose/tables'
import type { EditorView } from '@milkdown/kit/prose/view'
import { EditorView as CodeMirrorView } from '@codemirror/view'
import { findContainer } from './blockCommands'

export interface EditorContext {
  doc: Node
  selection: Selection
  target: 'text' | 'image' | 'math' | 'code' | 'cells' | 'block'
  containers: string[]
  node: { pos: number; node: Node } | null
  link: { from: number; to: number; mark: Mark } | null
}

export const selectionContainsPosition = (selection: Selection, pos: number) => {
  if (selection.empty) return false
  if (selection instanceof CellSelection) {
    let inside = false
    selection.forEachCell((cell, cellPos) => {
      if (pos >= cellPos && pos < cellPos + cell.nodeSize) inside = true
    })
    return inside
  }
  return pos >= selection.from && pos < selection.to
}

const findLink = (view: EditorView, pos: number) => {
  const $pos = view.state.doc.resolve(pos)
  const mark = ($pos.nodeAfter?.marks ?? $pos.marks()).find((item) => item.type.name === 'link')
  if (!mark) return null
  let from = -1
  let to = -1
  const start = $pos.start()
  const ranges: { from: number; to: number }[] = []
  $pos.parent.forEach((child, offset) => {
    if (!child.marks.some((item) => item.eq(mark))) {
      if (from >= 0) ranges.push({ from, to })
      from = -1
      to = -1
      return
    }
    const childFrom = start + offset
    const childTo = childFrom + child.nodeSize
    if (from === -1) from = childFrom
    to = childTo
  })
  if (from >= 0) ranges.push({ from, to })
  const range = ranges.find((item) => item.from <= pos && pos < item.to)
  return range ? { ...range, mark } : null
}

export const resolveContextTarget = (view: EditorView, event: MouseEvent): EditorContext => {
  const target = event.target instanceof HTMLElement ? event.target : null
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
  let pos = hit?.pos ?? view.state.doc.content.size
  let object: EditorContext['node'] = null
  if (target)
    view.state.doc.descendants((node, nodePos) => {
      if (object) return false
      if (!['image', 'math_inline', 'math_block', 'code_block'].includes(node.type.name)) return
      const dom = view.nodeDOM(nodePos)
      if (dom instanceof HTMLElement && dom.contains(target)) object = { pos: nodePos, node }
    })

  const selectedObject = object as EditorContext['node']
  let selection = view.state.selection
  const preserveOuterSelection =
    selectedObject?.node.type.name === 'code_block' &&
    selection instanceof TextSelection &&
    selectionContainsPosition(selection, pos) &&
    (selection.from < selectedObject.pos + 1 ||
      selection.to > selectedObject.pos + 1 + selectedObject.node.content.size)
  if (selectedObject?.node.type.name === 'code_block' && !preserveOuterSelection) {
    const cmRoot = target?.closest<HTMLElement>('.cm-editor')
    const cm = cmRoot ? CodeMirrorView.findFromDOM(cmRoot) : null
    const codeStart = selectedObject.pos + 1
    if (cm) {
      const codePos = cm.posAtCoords({ x: event.clientX, y: event.clientY })
      const range = cm.state.selection.main
      if (codePos !== null && (range.empty || codePos < range.from || codePos >= range.to)) {
        cm.dispatch({ selection: { anchor: codePos } })
      }
      const next = cm.state.selection.main
      selection = TextSelection.create(
        view.state.doc,
        codeStart + next.anchor,
        codeStart + next.head,
      )
    } else selection = TextSelection.create(view.state.doc, codeStart)
    pos = selection.from
  } else if (!selectionContainsPosition(selection, pos)) {
    selection = selectedObject
      ? NodeSelection.create(view.state.doc, selectedObject.pos)
      : TextSelection.near(view.state.doc.resolve(pos))
  }
  view.dispatch(view.state.tr.setSelection(selection))
  const containers = Array.from(
    { length: selection.$from.depth },
    (_, index) => selection.$from.node(index + 1).type.name,
  )
  const code = preserveOuterSelection ? null : findContainer(view.state, ['code_block'])
  const atom =
    selection instanceof NodeSelection &&
    ['image', 'math_inline', 'math_block'].includes(selection.node.type.name)
      ? { pos: selection.from, node: selection.node }
      : null
  const hasText = selection instanceof TextSelection && !selection.empty
  return {
    doc: view.state.doc,
    selection,
    containers,
    target: code
      ? 'code'
      : atom?.node.type.name === 'image'
        ? 'image'
        : atom
          ? 'math'
          : selection instanceof CellSelection
            ? 'cells'
            : hasText
              ? 'text'
              : 'block',
    node: atom ?? code,
    link: target?.closest('a') ? findLink(view, pos) : null,
  }
}

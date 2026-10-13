import { NodeSelection, TextSelection, type Selection } from '@milkdown/kit/prose/state'
import { CellSelection } from '@milkdown/kit/prose/tables'
import type { EditorView } from '@milkdown/kit/prose/view'
import { EditorView as CodeMirrorView } from '@codemirror/view'
import { captureSelectionContext, findLinkAt, type EditorContext } from './selectionContext'
export type { EditorContext } from './selectionContext'

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

export const resolveContextTarget = (view: EditorView, event: MouseEvent): EditorContext => {
  const target = event.target instanceof Element ? event.target : null
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
  let pos = hit?.pos ?? view.state.doc.content.size
  let object: EditorContext['node'] = null
  if (target)
    view.state.doc.descendants((node, nodePos) => {
      if (object) return false
      if (
        node.type.name !== 'code_block' &&
        (!node.isAtom || node.isText || node.type.name === 'hardbreak')
      )
        return
      const dom = view.nodeDOM(nodePos)
      if (dom instanceof HTMLElement && dom.contains(target)) object = { pos: nodePos, node }
    })

  const selectedObject = object as EditorContext['node']
  let selection = view.state.selection
  const preserveOuterSelection =
    selectedObject?.node.type.name === 'code_block' &&
    selectionContainsPosition(selection, pos) &&
    (!(selection instanceof TextSelection) ||
      selection.from < selectedObject.pos + 1 ||
      selection.to > selectedObject.pos + 1 + selectedObject.node.content.size)
  if (selectedObject?.node.type.name === 'code_block' && !preserveOuterSelection) {
    const cmRoot = target?.closest<HTMLElement>('.cm-editor')
    const cm = cmRoot ? CodeMirrorView.findFromDOM(cmRoot) : null
    const codeStart = selectedObject.pos + 1
    if (cm) {
      const codePos = cm.posAtCoords({ x: event.clientX, y: event.clientY })
      if (
        codePos !== null &&
        !cm.state.selection.ranges.some(
          (range) => !range.empty && codePos >= range.from && codePos < range.to,
        )
      ) {
        cm.dispatch({ selection: { anchor: codePos } })
      }
      const next = cm.state.selection.main
      selection = TextSelection.create(
        view.state.doc,
        codeStart + next.anchor,
        codeStart + next.head,
      )
    } else selection = NodeSelection.create(view.state.doc, selectedObject.pos)
    pos = selection.from
  } else if (!selectionContainsPosition(selection, pos)) {
    selection = selectedObject
      ? NodeSelection.create(view.state.doc, selectedObject.pos)
      : TextSelection.near(view.state.doc.resolve(pos))
  }
  if (!view.state.selection.eq(selection)) view.dispatch(view.state.tr.setSelection(selection))
  const context = captureSelectionContext(view)
  if (target?.closest('a'))
    context.link = findLinkAt(view.state, pos) ?? findLinkAt(view.state, Math.max(0, pos - 1))
  return context
}

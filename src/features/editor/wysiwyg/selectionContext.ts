import type { Mark, Node } from '@milkdown/kit/prose/model'
import {
  AllSelection,
  NodeSelection,
  type EditorState,
  type Selection,
} from '@milkdown/kit/prose/state'
import { CellSelection } from '@milkdown/kit/prose/tables'
import { EditorView as CodeMirrorView } from '@codemirror/view'
import type { EditorState as CodeState } from '@codemirror/state'
import type { EditorView } from '@milkdown/kit/prose/view'

export type FormatState = 'off' | 'on' | 'mixed'
export interface EditorContext {
  doc: Node
  selection: Selection
  target:
    | 'text'
    | 'inlineCode'
    | 'image'
    | 'math'
    | 'code'
    | 'cells'
    | 'block'
    | 'mixed'
    | 'all'
    | 'footnote'
    | 'source'
    | 'linkDefinition'
    | 'rule'
  containers: string[]
  node: { pos: number; node: Node } | null
  link: { from: number; to: number; mark: Mark } | null
  kind?: 'caret' | 'text' | 'node' | 'cells' | 'all'
  marks?: Record<string, FormatState>
  blockTypes?: string[]
  nativeCode?: { view: CodeMirrorView; state: CodeState }
}

export const findLinkAt = (state: Pick<EditorState, 'doc'>, pos: number) => {
  const $pos = state.doc.resolve(pos)
  const ranges: { from: number; to: number; mark: Mark }[] = []
  $pos.parent.forEach((node, offset) => {
    const mark = node.marks.find((item) => item.type.name === 'link')
    if (!mark) return
    const from = $pos.start() + offset
    const previous = ranges.at(-1)
    if (previous?.to === from && previous.mark.eq(mark)) previous.to += node.nodeSize
    else ranges.push({ from, to: from + node.nodeSize, mark })
  })
  return ranges.find((range) => range.from <= pos && pos < range.to) ?? null
}

/** 只分析最终选区，不移动光标或产生编辑事务。 */
export const resolveSelectionContext = (state: EditorState): EditorContext => {
  const { selection, doc } = state
  const end = doc.resolve(
    selection.empty ? selection.to : Math.max(selection.from, selection.to - 1),
  )
  const containers: string[] = []
  for (let depth = 1; depth <= Math.min(selection.$from.depth, end.depth); depth += 1) {
    if (selection.$from.before(depth) !== end.before(depth)) break
    containers.push(selection.$from.node(depth).type.name)
  }
  const kind =
    selection instanceof CellSelection
      ? 'cells'
      : selection instanceof NodeSelection
        ? 'node'
        : selection instanceof AllSelection
          ? 'all'
          : selection.empty
            ? 'caret'
            : 'text'
  let node: EditorContext['node'] =
    selection instanceof NodeSelection ? { pos: selection.from, node: selection.node } : null
  if (!node && selection.$from.sameParent(selection.$to) && selection.$from.parent.type.spec.code) {
    node = { pos: selection.$from.before(), node: selection.$from.parent }
  }
  if (!node && selection.empty) {
    for (let depth = selection.$from.depth; depth > 0; depth--) {
      if (selection.$from.node(depth).type.name !== 'html_inline') continue
      node = { pos: selection.$from.before(depth), node: selection.$from.node(depth) }
      break
    }
  }
  const parts = new Set<string>()
  const blocks = new Set<string>()
  let characters = 0
  const marked: Record<string, number> = {}
  doc.nodesBetween(selection.from, selection.to, (item, pos) => {
    if (item.isTextblock)
      blocks.add(item.type.name === 'heading' ? `heading${item.attrs.level}` : item.type.name)
    if (item.type.spec.code) {
      parts.add('code')
      return false
    }
    if (item.isAtom && !item.isText && item.type.name !== 'hardbreak') {
      parts.add(item.type.name)
      return false
    }
    if (!item.isText) return
    const length = Math.max(
      0,
      Math.min(selection.to, pos + item.nodeSize) - Math.max(selection.from, pos),
    )
    characters += length
    parts.add('text')
    item.marks.forEach((mark) => {
      marked[mark.type.name] = (marked[mark.type.name] ?? 0) + length
    })
  })
  const marks = Object.fromEntries(
    Object.keys(state.schema.marks).map((name) => [
      name,
      characters && marked[name] === characters ? 'on' : marked[name] ? 'mixed' : 'off',
    ]),
  ) as Record<string, FormatState>
  if (selection.empty) {
    for (const mark of state.storedMarks ?? selection.$from.marks()) marks[mark.type.name] = 'on'
    if (selection.$from.parent.isTextblock)
      blocks.add(
        selection.$from.parent.type.name === 'heading'
          ? `heading${selection.$from.parent.attrs.level}`
          : selection.$from.parent.type.name,
      )
  }
  let target: EditorContext['target'] = 'block'
  if (kind === 'cells') target = 'cells'
  else if (kind === 'all') target = 'all'
  else if (node) {
    const name = node.node.type.name
    target =
      name === 'image'
        ? 'image'
        : name.startsWith('math_')
          ? 'math'
          : name === 'code_block'
            ? 'code'
            : name.startsWith('footnote_')
              ? 'footnote'
              : name === 'link_definition'
                ? 'linkDefinition'
                : ['html', 'html_block', 'html_inline', 'html_source', 'link_source'].includes(name)
                  ? 'source'
                  : name === 'hr'
                    ? 'rule'
                    : 'block'
  } else if (kind === 'text') {
    target =
      parts.size === 1 && parts.has('text')
        ? marks.inlineCode === 'on'
          ? 'inlineCode'
          : marks.inlineCode === 'mixed'
            ? 'mixed'
            : 'text'
        : 'mixed'
  }
  const hitLink = findLinkAt(state, selection.from)
  const link = hitLink && (selection.empty || selection.to <= hitLink.to) ? hitLink : null
  return { doc, selection, target, kind, containers, node, link, marks, blockTypes: [...blocks] }
}

/** 内嵌代码编辑器有自己的多范围选区，不能用 ProseMirror 的主范围覆盖它。 */
export const captureSelectionContext = (view: EditorView) => {
  const context = resolveSelectionContext(view.state)
  if (context.target !== 'code' || !context.node || context.kind === 'node') return context
  const dom = view.nodeDOM(context.node.pos)
  const root = dom instanceof HTMLElement ? dom.querySelector<HTMLElement>('.cm-editor') : null
  const code = root ? CodeMirrorView.findFromDOM(root) : null
  if (code && code.state.doc.toString() === context.node.node.textContent)
    context.nativeCode = { view: code, state: code.state }
  return context
}

export const hasSelectedContent = (context: EditorContext) =>
  context.nativeCode
    ? context.nativeCode.state.selection.ranges.some((range) => !range.empty) ||
      context.kind === 'node'
    : !context.selection.empty

export const restoreEditorContext = (view: EditorView, context: EditorContext) => {
  if (view.isDestroyed || view.state.doc !== context.doc) return false
  if (context.nativeCode?.view.dom?.isConnected === false) return false
  if (context.nativeCode && context.nativeCode.view.state.doc !== context.nativeCode.state.doc)
    return false
  if (!view.state.selection.eq(context.selection))
    view.dispatch(view.state.tr.setSelection(context.selection))
  if (
    context.nativeCode &&
    !context.nativeCode.view.state.selection.eq(context.nativeCode.state.selection)
  )
    context.nativeCode.view.dispatch({ selection: context.nativeCode.state.selection })
  return true
}

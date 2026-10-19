import { Fragment } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import { NodeSelection, Selection, TextSelection, type Command } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

// 保留标记直到 Enter；不把代码、选区或单元格里的文字转换成块。
export const confirmHorizontalRule: Command = (state, dispatch) => {
  const { selection, schema } = state
  const { $from } = selection
  if (
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parentOffset !== $from.parent.content.size
  )
    return false
  for (let depth = 1; depth < $from.depth; depth += 1) {
    if (['table', 'table_cell', 'table_header'].includes($from.node(depth).type.name)) return false
  }
  const paragraph = $from.parent
  if (
    paragraph.childCount !== 1 ||
    !paragraph.firstChild?.isText ||
    paragraph.firstChild.marks.length
  )
    return false
  if (!/^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(paragraph.textContent))
    return false
  const replacement = Fragment.fromArray([
    schema.nodes.hr.create(),
    schema.nodes.paragraph.create(),
  ])
  const index = $from.index(-1)
  if (!$from.node(-1).canReplace(index, index + 1, replacement)) return false
  if (dispatch) {
    const from = $from.before()
    const tr = closeHistory(state.tr).replaceWith(from, $from.after(), replacement)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2)).scrollIntoView())
  }
  return true
}

// 菜单插入保留正文，空段落直接替换，并始终提供后续输入位置。
export const insertHorizontalRule: Command = (state, dispatch) => {
  const { $to, empty } = state.selection
  const replaceEmpty = empty && $to.parent.type.name === 'paragraph' && !$to.parent.content.size
  const from = replaceEmpty ? $to.before() : $to.depth ? $to.after(1) : $to.pos
  const to = replaceEmpty ? $to.after() : from
  const replacement = Fragment.fromArray([
    state.schema.nodes.hr.create(),
    state.schema.nodes.paragraph.create(),
  ])
  const $position = state.doc.resolve(from)
  if (!$position.parent.canReplace($position.index(), state.doc.resolve(to).index(), replacement))
    return false
  if (dispatch) {
    const tr = closeHistory(state.tr).replaceWith(from, to, replacement)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2)).scrollIntoView())
  }
  return true
}

export const handleHorizontalRuleKeyDown = (view: EditorView, event: KeyboardEvent) => {
  if (
    !view.editable ||
    view.composing ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return false
  if (event.key === 'Enter' && confirmHorizontalRule(view.state, view.dispatch)) {
    event.preventDefault()
    return true
  }
  const { selection } = view.state
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'hr') return false
  if (!['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    return false
  const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
  const position = direction < 0 ? selection.from : selection.to
  const tr = view.state.tr
  const $position = tr.doc.resolve(position)
  const adjacent = direction < 0 ? $position.nodeBefore : $position.nodeAfter
  // 连续分割线逐个移动，不能越过它们跳到远处正文。
  if (event.key !== 'Enter' && adjacent?.type.name === 'hr') {
    tr.setSelection(
      NodeSelection.create(tr.doc, direction < 0 ? position - adjacent.nodeSize : position),
    )
  } else if (adjacent?.isTextblock) {
    tr.setSelection(Selection.findFrom($position, direction, true)!)
  } else {
    const paragraph = view.state.schema.nodes.paragraph.create()
    if (!$position.parent.canReplaceWith($position.index(), $position.index(), paragraph.type))
      return false
    tr.insert(position, paragraph)
    tr.setSelection(TextSelection.create(tr.doc, position + 1))
  }
  event.preventDefault()
  view.dispatch(tr.scrollIntoView())
  return true
}

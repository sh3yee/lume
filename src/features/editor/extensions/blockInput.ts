import { Fragment } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import { NodeSelection, TextSelection, type Command } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { alertPattern, alertTypes } from './callouts'

export const insertDocumentBlock =
  (name: string, kind = 'NOTE'): Command =>
  (state, dispatch) => {
    const type = state.schema.nodes[name]
    if (!type || (name === 'front_matter' && state.doc.firstChild?.type === type)) return false
    const node = type.createAndFill(name === 'callout' ? { kind } : null)
    if (!node) return false
    const { $from, $to, empty } = state.selection
    const replaceEmpty =
      empty &&
      $from.depth === 1 &&
      $from.parent.type.name === 'paragraph' &&
      !$from.parent.content.size
    const from =
      name === 'front_matter'
        ? 0
        : replaceEmpty
          ? $from.before()
          : $to.depth
            ? $to.after(1)
            : $to.pos
    const to =
      replaceEmpty && (name !== 'front_matter' || from === $from.before()) ? $from.after() : from
    const tr = closeHistory(state.tr).replaceWith(
      from,
      to,
      Fragment.fromArray([node, state.schema.nodes.paragraph.create()]),
    )
    tr.setSelection(
      name === 'toc'
        ? NodeSelection.create(tr.doc, from)
        : TextSelection.create(tr.doc, from + (name === 'callout' ? 2 : 1)),
    )
    if (dispatch) dispatch(tr.scrollIntoView())
    return true
  }

export function handleDocumentBlockKeyDown(view: EditorView, event: KeyboardEvent) {
  if (!view.editable || view.composing || event.isComposing || event.altKey || event.shiftKey)
    return false
  const { state } = view
  const { $from, empty } = state.selection
  if ($from.parent.type.name === 'front_matter') {
    if (event.key !== 'Enter') return false
    event.preventDefault()
    const line = $from.parent.textContent.slice(0, $from.parentOffset).split('\n').at(-1)
    if (
      event.ctrlKey ||
      event.metaKey ||
      (line === '---' && $from.parentOffset === $from.parent.content.size)
    ) {
      const tr = state.tr
      if (line === '---' && !event.ctrlKey && !event.metaKey) {
        const end = $from.pos
        tr.delete(end - 3 - ($from.parentOffset > 3 ? 1 : 0), end)
      }
      const after = tr.mapping.map($from.after())
      if (tr.doc.nodeAt(after)?.type.name !== 'paragraph')
        tr.insert(after, state.schema.nodes.paragraph.create())
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView())
    } else view.dispatch(state.tr.insertText('\n').scrollIntoView())
    return true
  }
  if (event.ctrlKey || event.metaKey || event.key !== 'Enter') return false
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'toc') {
    event.preventDefault()
    const pos = state.selection.to
    const tr = state.tr.insert(pos, state.schema.nodes.paragraph.create())
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
    return true
  }
  if (
    !empty ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parentOffset !== $from.parent.content.size ||
    $from.parent.childCount !== 1 ||
    !$from.parent.firstChild?.isText ||
    $from.parent.firstChild.marks.length
  )
    return false
  const source = $from.parent.textContent
  let name: string | undefined
  if ($from.depth === 1 && $from.before() === 0 && source === '---') name = 'front_matter'
  else if ($from.depth === 1 && /^\[toc\]$/i.test(source)) name = 'toc'
  if (name && state.schema.nodes[name]) {
    const pos = $from.before()
    const node = state.schema.nodes[name].create()
    const tr = closeHistory(state.tr).replaceWith(pos, $from.after(), [
      node,
      state.schema.nodes.paragraph.create(),
    ])
    tr.setSelection(
      TextSelection.create(tr.doc, name === 'front_matter' ? pos + 1 : pos + node.nodeSize + 1),
    )
    event.preventDefault()
    view.dispatch(tr.scrollIntoView())
    return true
  }
  const match = source.match(alertPattern)
  if (
    !match ||
    !alertTypes.includes(match[1] as (typeof alertTypes)[number]) ||
    $from.depth !== 2 ||
    $from.node(-1).type.name !== 'blockquote' ||
    $from.index(-1) !== 0 ||
    !state.schema.nodes.callout
  )
    return false
  const quote = $from.node(-1),
    pos = $from.before(-1)
  const children = [state.schema.nodes.paragraph.create()]
  for (let i = 1; i < quote.childCount; i++) children.push(quote.child(i))
  const tr = closeHistory(state.tr).replaceWith(
    pos,
    pos + quote.nodeSize,
    state.schema.nodes.callout.create({ kind: match[1] }, children),
  )
  event.preventDefault()
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 2)).scrollIntoView())
  return true
}

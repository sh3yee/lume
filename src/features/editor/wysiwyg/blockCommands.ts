import { lift, setBlockType, wrapIn } from '@milkdown/kit/prose/commands'
import { liftListItem, sinkListItem, wrapInList } from '@milkdown/kit/prose/schema-list'
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
} from '@milkdown/kit/prose/state'
import type { Node } from '@milkdown/kit/prose/model'

export const findContainer = (state: EditorState, names: string[]) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (names.includes(node.type.name)) return { node, pos: $from.before(depth), depth }
  }
  return null
}

export const convertHeading =
  (level: number): Command =>
  (state, dispatch) =>
    setBlockType(state.schema.nodes.heading, { level })(state, dispatch)

export const convertList =
  (ordered: boolean): Command =>
  (state, dispatch) => {
    const type = state.schema.nodes[ordered ? 'ordered_list' : 'bullet_list']
    const container = findContainer(state, ['ordered_list', 'bullet_list'])
    if (!container) return wrapInList(type)(state, dispatch)
    if (state.selection.to > container.pos + container.node.nodeSize) return false
    if (container.node.type === type) return false
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(container.pos, type, container.node.attrs)
      let offset = container.pos + 1
      container.node.forEach((item, _offset, index) => {
        tr.setNodeMarkup(offset, undefined, {
          ...item.attrs,
          listType: ordered ? 'ordered' : 'bullet',
          label: ordered ? `${index + 1}.` : '•',
        })
        offset += item.nodeSize
      })
      dispatch(tr.scrollIntoView())
    }
    return true
  }

export const convertBlockquote: Command = (state, dispatch) => {
  if (findContainer(state, ['blockquote'])) return false
  return wrapIn(state.schema.nodes.blockquote)(state, dispatch)
}

export const convertParagraph: Command = (state, dispatch) => {
  const list = findContainer(state, ['list_item'])
  if (list) return liftListItem(state.schema.nodes.list_item)(state, dispatch)
  if (findContainer(state, ['blockquote', 'callout'])) return lift(state, dispatch)
  return setBlockType(state.schema.nodes.paragraph)(state, dispatch)
}

export const indentList: Command = (state, dispatch) =>
  sinkListItem(state.schema.nodes.list_item)(state, dispatch)
export const outdentList: Command = (state, dispatch) =>
  liftListItem(state.schema.nodes.list_item)(state, dispatch)

export const toggleTask: Command = (state, dispatch) => {
  const item = findContainer(state, ['list_item'])
  if (!item) return false
  dispatch?.(
    state.tr.setNodeAttribute(item.pos, 'checked', !item.node.attrs.checked).scrollIntoView(),
  )
  return true
}

// 插入块在当前顶层块之后新增，不用所选正文拼接新节点。
export const insertBlock = (state: EditorState, node: Node) => {
  const { $to } = state.selection
  const pos = $to.depth ? $to.after(1) : $to.pos
  const tr = state.tr.insert(pos, node)
  const selection = node.isAtom
    ? NodeSelection.create(tr.doc, pos)
    : TextSelection.near(tr.doc.resolve(pos + 1))
  return tr.setSelection(selection).scrollIntoView()
}

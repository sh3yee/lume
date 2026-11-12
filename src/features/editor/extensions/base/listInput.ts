import { liftListItem } from '@milkdown/kit/prose/schema-list'
import { TextSelection, type Command } from '@milkdown/kit/prose/state'
import { $useKeymap } from '@milkdown/kit/utils'

const removeEmptyParagraphBeforeList =
  (pos: number): Command =>
  (state, dispatch) => {
    const $pos = state.doc.resolve(pos)
    const paragraph = $pos.nodeAfter
    const index = $pos.index()
    const list = $pos.parent.maybeChild(index + 1)
    if (
      paragraph?.type.name !== 'paragraph' ||
      paragraph.content.size !== 0 ||
      !list ||
      !['bullet_list', 'ordered_list'].includes(list.type.name) ||
      !$pos.parent.canReplace(index, index + 1)
    )
      return false

    if (dispatch) {
      const tr = state.tr.delete(pos, pos + paragraph.nodeSize)
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos))).scrollIntoView())
    }
    return true
  }

export const deleteEmptyParagraphBeforeList: Command = (state, dispatch) => {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty || selection.$from.depth === 0)
    return false
  return removeEmptyParagraphBeforeList(selection.$from.before())(state, dispatch)
}

export const liftListItemAtStart: Command = (state, dispatch) => {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const { $from } = selection
  if (
    $from.depth < 2 ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parentOffset !== 0 ||
    $from.index(-1) !== 0 ||
    $from.node(-1).type.name !== 'list_item'
  )
    return false

  // 首项前有空段落时，先删除空行，保留列表层级和任务勾选状态。
  if ($from.depth >= 3 && $from.index(-2) === 0) {
    const $list = state.doc.resolve($from.before(-2))
    const previous = $list.nodeBefore
    if (previous && removeEmptyParagraphBeforeList($list.pos - previous.nodeSize)(state, dispatch))
      return true
  }

  // 行首退格先退出当前列表层级，避免合并到前一项后留下正文缩进
  return liftListItem($from.node(-1).type)(state, dispatch)
}

export const listBackspaceKeymap = $useKeymap('lumeListBackspace', {
  DeleteEmptyParagraphBeforeList: {
    shortcuts: 'Delete',
    priority: 60,
    command: () => deleteEmptyParagraphBeforeList,
  },
  LiftListItemAtStart: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => liftListItemAtStart,
  },
})

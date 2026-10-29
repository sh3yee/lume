import { liftListItem } from '@milkdown/kit/prose/schema-list'
import { TextSelection, type Command } from '@milkdown/kit/prose/state'
import { $useKeymap } from '@milkdown/kit/utils'

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

  // 行首退格先退出当前列表层级，避免合并到前一项后留下正文缩进
  return liftListItem($from.node(-1).type)(state, dispatch)
}

export const listBackspaceKeymap = $useKeymap('lumeListBackspace', {
  LiftListItemAtStart: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => liftListItemAtStart,
  },
})

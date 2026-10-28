import { joinBackward } from '@milkdown/kit/prose/commands'
import { liftListItem } from '@milkdown/kit/prose/schema-list'
import { TextSelection, type Command } from '@milkdown/kit/prose/state'
import { $useKeymap } from '@milkdown/kit/utils'

export const liftBlockedListItem: Command = (state, dispatch, view) => {
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

  // 保留默认合并行为；首段后还有引用等块时，普通 lift 无法满足 list_item 的首段约束。
  if (joinBackward(state, undefined, view)) return false
  return liftListItem($from.node(-1).type)(state, dispatch)
}

export const listBackspaceKeymap = $useKeymap('lumeListBackspace', {
  LiftBlockedListItem: {
    shortcuts: 'Backspace',
    priority: 60,
    command: () => liftBlockedListItem,
  },
})

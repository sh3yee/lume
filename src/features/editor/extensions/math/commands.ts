import { closeHistory } from '@milkdown/kit/prose/history'
import { TextSelection, type EditorState } from '@milkdown/kit/prose/state'

export const deleteMathBlock = (state: EditorState, pos: number) => {
  const node = state.doc.nodeAt(pos)
  const paragraph = state.schema.nodes.paragraph.createAndFill()
  if (node?.type.name !== 'math_block' || !paragraph) return null

  const $pos = state.doc.resolve(pos)
  if (!$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, paragraph.type)) return null

  // 与 Typora 一致，删除公式块后在原位恢复正文，并与源码编辑分开撤销。
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, paragraph)
  return closeHistory(tr.setSelection(TextSelection.create(tr.doc, pos + 1)))
}

import { closeHistory } from '@milkdown/kit/prose/history'
import { TextSelection, type EditorState } from '@milkdown/kit/prose/state'

export const deleteHtmlNode = (state: EditorState, pos: number) => {
  const node = state.doc.nodeAt(pos)
  if (!node || !['html', 'html_block'].includes(node.type.name)) return null

  const tr = state.tr
  if (node.isBlock) {
    const paragraph = state.schema.nodes.paragraph.createAndFill()
    const $pos = state.doc.resolve(pos)
    const index = $pos.index()
    if (!paragraph || !$pos.parent.canReplaceWith(index, index + 1, paragraph.type)) return null

    tr.replaceWith(pos, pos + node.nodeSize, paragraph)
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  } else {
    tr.delete(pos, pos + node.nodeSize)
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos)))
  }
  // 清空源码直接删除对象，撤销时恢复删空前的内容而非空壳。
  return closeHistory(tr)
}

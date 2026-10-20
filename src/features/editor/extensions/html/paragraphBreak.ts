import { TextSelection, type Command } from '@milkdown/kit/prose/state'
import { canSplit } from '@milkdown/kit/prose/transform'

/** 先把换段位置移到 HTML 容器外，再交给段落、列表或表格的 Enter 规则。 */
export const prepareHtmlParagraphBreak: Command = (state, dispatch) => {
  const { selection } = state
  if (!(selection instanceof TextSelection) || selection.$from.parent.type.name !== 'html_inline')
    return false

  const tr = state.tr.deleteSelection()
  let $cursor = tr.selection.$from
  while ($cursor.parent.type.name === 'html_inline') {
    let position: number
    if (!$cursor.parent.content.size) {
      // 空容器在回车时退出，不向新段落复制占位标签。
      position = $cursor.before()
      tr.delete(position, $cursor.after())
    } else if ($cursor.parentOffset === 0) {
      position = $cursor.before()
    } else if ($cursor.parentOffset === $cursor.parent.content.size) {
      position = $cursor.after()
    } else {
      // 中间换段保留两侧的标签与属性，边界换段则不生成空副本。
      if (!canSplit(tr.doc, $cursor.pos)) return false
      tr.split($cursor.pos)
      position = $cursor.pos + 1
    }
    $cursor = tr.doc.resolve(position)
  }
  if (!$cursor.parent.isTextblock) return false
  tr.setSelection(TextSelection.create(tr.doc, $cursor.pos))
  dispatch?.(tr)
  return true
}

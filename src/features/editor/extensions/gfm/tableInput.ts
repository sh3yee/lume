import type { Node } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

const getHeaderCells = (paragraph: Node) => {
  const source = paragraph.textBetween(0, paragraph.content.size, '\n', '\ufffc')
  if (!/^ {0,3}\|[^\n]*\|[ \t]*$/.test(source)) return null

  const pipes: number[] = []
  paragraph.forEach((node, offset) => {
    if (!node.isText || node.marks.some((mark) => mark.type.spec.code)) return
    const text = node.text ?? ''
    for (let index = 0; index < text.length; index += 1) {
      const position = offset + index
      if (source[position] !== '|') continue
      let escapes = 0
      while (source[position - escapes - 1] === '\\') escapes += 1
      if (escapes % 2 === 0) pipes.push(position)
    }
  })
  if (pipes[0] !== source.indexOf('|') || pipes[pipes.length - 1] !== source.trimEnd().length - 1)
    return null

  // 按文档位置切分，保留已输入的粗体、链接、图片等行内节点。
  const cells = pipes.slice(1).map((end, index) => {
    const start = pipes[index] + 1
    const value = source.slice(start, end)
    const leading = value.length - value.trimStart().length
    const trailing = value.trimEnd().length
    return paragraph.cut(start + leading, start + Math.max(leading, trailing))
  })
  if (!cells.length || cells.every((cell) => /^:?-+:?$/.test(cell.textContent))) return null
  return cells
}

export const tableInputPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (
            (event.key !== 'Enter' && event.key !== 'Backspace') ||
            event.isComposing ||
            view.composing ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            !view.editable
          )
            return false

          const { state } = view
          const { $from, empty } = state.selection
          if (event.key === 'Backspace') {
            if (!empty) return false
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const node = $from.node(depth)
              if (node.type.name !== 'table') continue
              // 图片、公式等行内对象也算内容，避免误删。
              if (node.textBetween(0, node.content.size, '', '\ufffc')) return false
              event.preventDefault()
              view.dispatch(
                closeHistory(
                  state.tr.delete($from.before(depth), $from.after(depth)),
                ).scrollIntoView(),
              )
              return true
            }
            return false
          }
          if (
            !empty ||
            $from.parent.type.name !== 'paragraph' ||
            $from.parentOffset !== $from.parent.content.size
          )
            return false
          for (let depth = 1; depth < $from.depth; depth += 1) {
            if ($from.node(depth).type.name === 'table') return false
          }

          const cells = getHeaderCells($from.parent)
          if (!cells) return false
          const { table, table_header_row, table_header, table_row, table_cell, paragraph } =
            state.schema.nodes
          const container = $from.node(-1)
          const index = $from.index(-1)
          if (!container.canReplaceWith(index, index + 1, table)) return false

          const header = table_header_row.create(
            null,
            cells.map((cell) => table_header.create(null, cell)),
          )
          const row = table_row.create(
            null,
            cells.map(() => table_cell.create(null, paragraph.create())),
          )
          const from = $from.before()
          const tr = closeHistory(state.tr).replaceWith(
            from,
            $from.after(),
            table.create(null, [header, row]),
          )
          tr.setSelection(TextSelection.create(tr.doc, from + header.nodeSize + 4))
          event.preventDefault()
          view.dispatch(tr.scrollIntoView())
          return true
        },
      },
    }),
)

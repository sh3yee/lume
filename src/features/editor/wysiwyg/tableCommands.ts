import type { Command } from '@milkdown/kit/prose/state'
import {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from '@milkdown/kit/prose/tables'

const addRow =
  (after: boolean): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const index = after ? rect.bottom : rect.top
    if (index === 0) return false
    if (dispatch) {
      const header = rect.table.firstChild!
      const cells = Array.from({ length: header.childCount }, (_, col) =>
        state.schema.nodes.table_cell.createAndFill({
          alignment: header.child(col).attrs.alignment,
        })!,
      )
      const row = state.schema.nodes.table_row.create(null, cells)
      let offset = rect.tableStart
      for (let i = 0; i < index; i += 1) offset += rect.table.child(i).nodeSize
      dispatch(state.tr.insert(offset, row).scrollIntoView())
    }
    return true
  }

const removeRows: Command = (state, dispatch) => {
  if (!isInTable(state)) return false
  const rect = selectedRect(state)
  // GFM 表格必须保留表头和至少一行正文；整表删除有独立入口。
  if (rect.top === 0 || rect.table.childCount - (rect.bottom - rect.top) < 2) return false
  return deleteRow(state, dispatch)
}

const alignColumns =
  (alignment: string): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    if (dispatch) {
      const tr = state.tr
      rect.table.forEach((row, rowOffset) =>
        row.forEach((_cell, cellOffset, col) => {
          if (col < rect.left || col >= rect.right) return
          tr.setNodeAttribute(rect.tableStart + rowOffset + 1 + cellOffset, 'alignment', alignment)
        }),
      )
      dispatch(tr.scrollIntoView())
    }
    return true
  }

export const tableCommands: Record<string, Command> = {
  rowBefore: addRow(false),
  rowAfter: addRow(true),
  deleteRow: removeRows,
  colBefore: addColumnBefore,
  colAfter: addColumnAfter,
  deleteColumn,
  deleteTable,
  alignColumnLeft: alignColumns('left'),
  alignColumnCenter: alignColumns('center'),
  alignColumnRight: alignColumns('right'),
}

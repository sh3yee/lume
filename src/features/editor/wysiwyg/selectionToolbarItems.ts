import { AllSelection, TextSelection, type EditorState } from '@milkdown/kit/prose/state'
import { CellSelection, selectedRect } from '@milkdown/kit/prose/tables'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getContextMenuGroups } from './contextMenuItems'
import type { EditorContext } from './selectionContext'

export interface SelectionToolbarModel {
  title: string
  items: ContextMenuItem[]
  more: ContextMenuItem[][]
  placement: 'range' | 'object' | 'block'
}

export const getSelectionToolbarModel = (
  context: EditorContext,
  state: EditorState,
  editable = true,
): SelectionToolbarModel | null => {
  const selected = context.nativeCode
    ? context.nativeCode.state.selection.ranges.some((range) => !range.empty)
    : (context.selection instanceof TextSelection || context.selection instanceof AllSelection) &&
      !context.selection.empty &&
      Boolean(context.doc.textBetween(context.selection.from, context.selection.to))
  const objectSelected = context.kind === 'node' && context.node !== null
  const tableSelected =
    context.target === 'cells' || (context.kind === 'caret' && context.containers.includes('table'))
  if (!selected && !objectSelected && !tableSelected) return null
  let title = ''
  let ids: string[] = []
  let placement: SelectionToolbarModel['placement'] = 'range'
  if (context.target === 'text') {
    title = context.containers.includes('table')
      ? '单元格文字'
      : context.containers.includes('list_item')
        ? '列表文字'
        : context.containers.includes('blockquote')
          ? '引用文字'
          : context.blockTypes?.length === 1 && context.blockTypes[0].startsWith('heading')
            ? `H${context.blockTypes[0].slice(-1)}`
            : context.blockTypes && context.blockTypes.length > 1
              ? '多块文字'
              : '文字'
    ids = ['bold', 'italic', 'strike', 'inlineCode', 'setLink', 'copy']
  } else if (context.target === 'inlineCode') {
    title = '行内代码'
    ids = ['copy', 'inlineCode']
  } else if (objectSelected && context.target === 'image') {
    title = '图片'
    placement = 'object'
    ids = ['editImage', 'imageLeft', 'imageCenter', 'imageRight', 'resetImageSize']
  } else if (objectSelected && context.target === 'math') {
    title = '公式'
    placement = 'object'
    ids = ['editMath', 'copyMath']
  } else if (context.target === 'code') {
    title = objectSelected ? '代码块' : '选中代码'
    placement = objectSelected ? 'object' : 'range'
    ids = objectSelected ? ['copyCode', 'editCodeLanguage'] : ['copy']
  } else if (tableSelected) {
    const rect = selectedRect(state)
    const selection = context.selection
    title =
      selection instanceof CellSelection
        ? selection.isRowSelection() && selection.isColSelection()
          ? '整个表格'
          : selection.isColSelection()
            ? `选中 ${rect.right - rect.left} 列`
            : selection.isRowSelection()
              ? `选中 ${rect.bottom - rect.top} 行`
              : `选中 ${rect.bottom - rect.top} × ${rect.right - rect.left} 单元格`
        : `表格 · 第 ${rect.top + 1} 行 / 第 ${rect.left + 1} 列`
    placement = selection instanceof CellSelection ? 'range' : 'block'
    ids = [
      ...(selection instanceof CellSelection ? ['copy'] : []),
      'rowAfter',
      'colAfter',
      'alignColumnLeft',
      'alignColumnCenter',
      'alignColumnRight',
    ]
  } else if (['mixed', 'all'].includes(context.target)) {
    title = context.target === 'all' ? '整个文档' : '混合选区'
    ids = ['copy', 'cut']
  } else if (objectSelected && ['source', 'footnote', 'rule'].includes(context.target)) {
    title =
      context.target === 'source'
        ? '源码节点'
        : context.target === 'footnote'
          ? `脚注 ${context.node?.node.attrs.label ?? ''}`
          : '分割线'
    placement = 'object'
    ids =
      context.target === 'footnote'
        ? ['gotoFootnote', 'copySource', 'editSource']
        : context.target === 'source'
          ? ['copySource', 'editSource']
          : ['paragraphBefore', 'paragraphAfter']
  } else if (objectSelected) {
    const table = context.node?.node.type.name === 'table'
    title = table ? '整个表格' : '整个块'
    placement = 'object'
    ids = table ? ['copy', 'cut', 'paragraphBefore', 'paragraphAfter', 'deleteNode'] : ['copy']
  } else return null
  const groups = getContextMenuGroups(context, state, editable)
  const entries = groups.flatMap((group) =>
    group.flatMap((item) => [item, ...(item.children ?? [])]),
  )
  const items = ids.flatMap((id) => {
    const item = entries.find((item) => item.id === id)
    return item ? [item] : []
  })
  const used = new Set(ids)
  const more = groups
    .map((group) =>
      group
        .filter((item) => !used.has(item.id))
        .map((item) =>
          item.children
            ? { ...item, children: item.children.filter((child) => !used.has(child.id)) }
            : item,
        )
        .filter((item) => !item.children || item.children.length),
    )
    .filter((group) => group.length)
  return { title, items, more, placement }
}

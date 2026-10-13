import type { EditorState } from '@milkdown/kit/prose/state'
import { CellSelection, selectedRect } from '@milkdown/kit/prose/tables'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getContextMenuGroups } from './contextMenuItems'
import { hasSelectedContent, type EditorContext } from './selectionContext'

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
  let title = ''
  let ids: string[] = []
  let placement: SelectionToolbarModel['placement'] = 'range'
  const selected = hasSelectedContent(context)
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
  } else if (context.target === 'image') {
    title = '图片'
    placement = 'object'
    ids = ['editImage', 'imageLeft', 'imageCenter', 'imageRight', 'resetImageSize']
  } else if (context.target === 'math') {
    title = '公式'
    placement = 'object'
    ids = ['editMath', 'copyMath']
  } else if (context.target === 'code' && selected) {
    title = context.kind === 'node' ? '代码块' : '选中代码'
    ids = context.kind === 'node' ? ['copyCode', 'editCodeLanguage'] : ['copy']
  } else if (
    context.target === 'cells' ||
    (context.kind === 'caret' && context.containers.includes('table') && !context.link)
  ) {
    const rect = selectedRect(state)
    const selection = state.selection
    title =
      selection instanceof CellSelection
        ? selection.isColSelection()
          ? `选中 ${rect.right - rect.left} 列`
          : selection.isRowSelection()
            ? `选中 ${rect.bottom - rect.top} 行`
            : `选中 ${rect.bottom - rect.top} × ${rect.right - rect.left} 单元格`
        : `表格 · 第 ${rect.top + 1} 行 / ${rect.left + 1} 列`
    placement = selected ? 'range' : 'block'
    ids = [
      ...(selected ? ['copy'] : []),
      'rowAfter',
      'colAfter',
      'alignColumnLeft',
      'alignColumnCenter',
      'alignColumnRight',
    ]
  } else if (['mixed', 'all'].includes(context.target)) {
    title = context.target === 'all' ? '整个文档' : '混合选区'
    ids = ['copy', 'cut']
  } else if (['source', 'footnote', 'rule'].includes(context.target)) {
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
  } else if (context.kind === 'node') {
    title = context.node?.node.type.name === 'table' ? '整个表格' : '整个块'
    placement = 'object'
    ids = ['copy']
  } else if (context.link) {
    title = '链接'
    ids = ['editLink', 'openLink', 'copyLink']
  } else if (
    context.kind === 'caret' &&
    context.containers.some((name) =>
      ['heading', 'list_item', 'blockquote', 'footnote_definition'].includes(name),
    )
  ) {
    title = context.containers.includes('list_item')
      ? '当前列表项'
      : context.containers.includes('blockquote')
        ? '引用块'
        : context.containers.includes('footnote_definition')
          ? '脚注定义'
          : `H${context.blockTypes?.[0]?.slice(-1) ?? ''}`
    placement = 'block'
    ids = context.containers.includes('list_item')
      ? ['indentList', 'outdentList', 'toggleTask']
      : ['convert']
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

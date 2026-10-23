import { t } from '@/app/i18n'
import { AllSelection, TextSelection, type EditorState } from '@milkdown/kit/prose/state'
import { CellSelection, selectedRect } from '@milkdown/kit/prose/tables'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getContextMenuGroups } from './contextMenuItems'
import type { EditorContext } from './selectionContext'

export interface SelectionToolbarModel {
  title: string
  hideTitle?: boolean
  items: (ContextMenuItem & { icon?: string })[]
  more: ContextMenuItem[][]
  placement: 'range' | 'object' | 'block'
}

export const getSelectionToolbarModel = (
  context: EditorContext,
  state: EditorState,
  editable = true,
): SelectionToolbarModel | null => {
  // HTML 使用原位源码入口与右键菜单，避免重复的浮动栏遮挡内容。
  if (
    context.node &&
    ['html', 'html_block', 'html_inline', 'html_source'].includes(context.node.node.type.name)
  )
    return null
  const selected = context.nativeCode
    ? context.nativeCode.state.selection.ranges.some((range) => !range.empty)
    : (context.selection instanceof TextSelection || context.selection instanceof AllSelection) &&
      !context.selection.empty &&
      Boolean(context.doc.textBetween(context.selection.from, context.selection.to))
  const objectSelected = context.kind === 'node' && context.node !== null
  const tableSelected = context.target === 'cells'
  if (!selected && !objectSelected && !tableSelected) return null
  let title = ''
  let ids: string[] = []
  let placement: SelectionToolbarModel['placement'] = 'range'
  if (context.target === 'text') {
    title = context.containers.includes('table')
      ? t('单元格文字')
      : context.containers.includes('list_item')
        ? t('列表文字')
        : context.containers.includes('blockquote')
          ? t('引用文字')
          : context.blockTypes?.length === 1 && context.blockTypes[0].startsWith('heading')
            ? `H${context.blockTypes[0].slice(-1)}`
            : context.blockTypes && context.blockTypes.length > 1
              ? t('多块文字')
              : t('文字')
    ids = ['bold', 'italic', 'strike', 'inlineCode', 'setLink', 'copy']
  } else if (context.target === 'inlineCode') {
    title = t('行内代码')
    ids = ['copy', 'inlineCode']
  } else if (objectSelected && context.target === 'image') {
    if (!context.node?.node.attrs.src) return null
    title = t('图片')
    placement = 'object'
    ids = ['editImage', 'imageAlign', 'resetImageSize']
  } else if (objectSelected && context.target === 'math') {
    title = t('公式')
    placement = 'object'
    ids = context.node?.node.type.name === 'math_block' ? ['copyMath'] : ['editMath', 'copyMath']
  } else if (context.target === 'code') {
    title = objectSelected ? t('代码块') : t('选中代码')
    placement = objectSelected ? 'object' : 'range'
    ids = objectSelected ? ['copyCode', 'editCodeLanguage'] : ['copy']
  } else if (tableSelected) {
    const rect = selectedRect(state)
    const selection = context.selection
    title =
      selection instanceof CellSelection
        ? selection.isRowSelection() && selection.isColSelection()
          ? t('整个表格')
          : selection.isColSelection()
            ? t('选中 {0} 列', rect.right - rect.left)
            : selection.isRowSelection()
              ? t('选中 {0} 行', rect.bottom - rect.top)
              : t('选中 {0} × {1} 单元格', rect.bottom - rect.top, rect.right - rect.left)
        : t('表格')
    placement = selection instanceof CellSelection ? 'range' : 'block'
    ids = ['copy', 'tableAlign', 'tableInsert', 'tableDelete']
  } else if (['mixed', 'all'].includes(context.target)) {
    title = context.target === 'all' ? t('整个文档') : t('混合选区')
    ids = ['copy', 'cut']
  } else if (objectSelected && ['source', 'footnote', 'rule'].includes(context.target)) {
    title =
      context.target === 'source'
        ? t('源码节点')
        : context.target === 'footnote'
          ? t('脚注 {0}', context.node?.node.attrs.label ?? '')
          : t('分割线')
    placement = 'object'
    ids =
      context.target === 'footnote'
        ? ['gotoFootnote', 'copySource', 'editSource']
        : context.target === 'source'
          ? ['copySource', 'editSource']
          : ['paragraphBefore', 'paragraphAfter']
  } else if (objectSelected) {
    const table = context.node?.node.type.name === 'table'
    title = table ? t('整个表格') : t('整个块')
    placement = 'object'
    ids = table ? ['copy', 'cut', 'paragraphBefore', 'paragraphAfter', 'deleteNode'] : ['copy']
  } else return null
  const groups = getContextMenuGroups(context, state, editable)
  const entries = groups.flatMap((group) =>
    group.flatMap((item) => [item, ...(item.children ?? [])]),
  )
  const toolbarGroups: (ContextMenuItem & { icon?: string })[] = tableSelected
    ? [
        {
          id: 'tableAlign',
          label: t('对齐'),
          children: entries.filter((item) =>
            ['alignColumnLeft', 'alignColumnCenter', 'alignColumnRight'].includes(item.id),
          ),
        },
        {
          id: 'tableInsert',
          label: t('插入行列'),
          children: entries.filter((item) =>
            ['rowBefore', 'rowAfter', 'colBefore', 'colAfter'].includes(item.id),
          ),
        },
        {
          id: 'tableDelete',
          label: t('删除'),
          children: entries.filter((item) =>
            ['deleteRow', 'deleteColumn', 'deleteTable'].includes(item.id),
          ),
        },
      ]
    : []
  const imageAlign = entries.find((item) => item.id === 'imageAlign')
  if (ids.includes('imageAlign') && imageAlign) toolbarGroups.push({ ...imageAlign })
  for (const group of toolbarGroups) {
    group.disabled = group.children?.every((item) => item.disabled)
    if (group.id === 'tableAlign' || group.id === 'imageAlign') {
      group.icon = group.children?.find((item) => item.active === true)?.id ?? group.id
    }
  }
  const items = ids.flatMap((id) => {
    const item = [...toolbarGroups, ...entries].find((item) => item.id === id)
    return item ? [item] : []
  })
  const used = new Set([
    ...ids,
    ...toolbarGroups.flatMap((item) => item.children?.map((child) => child.id) ?? []),
  ])
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
  return { title, hideTitle: tableSelected, items, more, placement }
}

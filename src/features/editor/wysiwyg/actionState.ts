import { t } from '@/app/i18n'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getEditorCommand } from './editorCommands'
import { canOpenEditorLink } from './editorLinks'
import { hasSelectedContent, resolveSelectionContext, type EditorContext } from './selectionContext'
import { selectedRect } from '@milkdown/kit/prose/tables'
import { isLinkEnabled } from '../extensions/base/autoLinks'

const markNames: Record<string, string> = {
  bold: 'strong',
  italic: 'emphasis',
  strike: 'strike_through',
  inlineCode: 'inlineCode',
}
const copyActions = new Set([
  'copy',
  'copyCode',
  'copyMath',
  'copyImageAddress',
  'copyImageMarkdown',
  'copyLink',
  'copySource',
  'openLink',
  'gotoFootnote',
  'selectAll',
])

export const getActionState = (
  state: EditorState,
  target: EditorContext,
  id: string,
  editable = true,
): Pick<ContextMenuItem, 'disabled' | 'active' | 'reason'> => {
  const context = target.marks ? target : { ...resolveSelectionContext(state), ...target }
  let enabled = true
  let active: boolean | 'mixed' | undefined
  const command = getEditorCommand(state, id)
  if (command) enabled = command(state)
  else if (['copy', 'cut'].includes(id)) enabled = hasSelectedContent(context)
  else if (id === 'setLink') enabled = context.target === 'text'
  else if (['editLink', 'removeLink', 'copyLink', 'openLink'].includes(id))
    enabled = Boolean(context.link && isLinkEnabled(context.link.mark))
  else if (
    [
      'editImage',
      'copyImageAddress',
      'copyImageMarkdown',
      'imageLeft',
      'imageCenter',
      'imageRight',
      'resetImageSize',
      'copyImageTo',
      'moveImageTo',
      'uploadImage',
      'deleteImageFile',
    ].includes(id)
  )
    enabled = context.target === 'image'
  else if (/^imageZoom\d+$/.test(id)) enabled = context.target === 'image'
  else if (['editMath', 'copyMath'].includes(id)) enabled = context.target === 'math'
  else if (['copyCode', 'editCodeLanguage'].includes(id)) enabled = context.target === 'code'
  else if (['copySource', 'editSource'].includes(id))
    enabled = ['source', 'footnote'].includes(context.target)
  else if (id === 'gotoFootnote') enabled = context.node?.node.type.name === 'footnote_reference'
  else if (id === 'deleteNode')
    enabled = context.kind === 'node' || Boolean(context.node && !context.selection.empty)
  else if (['paragraphBefore', 'paragraphAfter'].includes(id))
    enabled = Boolean(context.node?.node.isBlock)
  else if (id === 'insertImage')
    enabled = !context.nativeCode && !context.selection.$from.parent.type.spec.code
  else if (id === 'insertImageAfter') enabled = ['block', 'text'].includes(context.target)
  else if (['insertHr', 'insertCode', 'insertTable'].includes(id))
    enabled = ['block', 'text'].includes(context.target)
  else if (!['paste', 'selectAll'].includes(id)) enabled = false
  if (id === 'openLink' && context.link)
    enabled = enabled && canOpenEditorLink(String(context.link.mark.attrs.href))
  if (id === 'deleteImageFile' && context.node)
    enabled =
      enabled && !/^(?:https?:|data:|blob:|\/\/)/i.test(String(context.node.node.attrs.src ?? ''))
  if (/^imageZoom\d+$/.test(id) && context.node)
    active = context.node.node.attrs.zoom === Number(id.slice(9))
  if (id in markNames) {
    const value = context.marks?.[markNames[id]]
    active = value === 'mixed' ? 'mixed' : value === 'on'
  }
  if (id.startsWith('image') && context.node) {
    const align = { imageLeft: 'left', imageCenter: 'center', imageRight: 'right' }[
      id as 'imageLeft'
    ]
    if (align) active = context.node.node.attrs.align === align
  }
  if (/^heading[1-6]$/.test(id))
    active = context.blockTypes?.length === 1 && context.blockTypes[0] === id
  if (id.startsWith('alignColumn') && context.containers.includes('table')) {
    const alignment = {
      alignColumnLeft: 'left',
      alignColumnCenter: 'center',
      alignColumnRight: 'right',
    }[id as 'alignColumnLeft']
    const rect = selectedRect(state)
    const values = Array.from(
      { length: rect.right - rect.left },
      (_, index) => rect.table.firstChild?.child(rect.left + index).attrs.alignment,
    )
    active = values.every((value) => value === alignment)
      ? true
      : values.some((value) => value === alignment)
        ? 'mixed'
        : false
  }
  if (!editable && !copyActions.has(id))
    return { disabled: true, active, reason: t('当前内容只读') }
  return {
    disabled: !enabled,
    active,
    reason: enabled
      ? undefined
      : active === true
        ? t('已经是此状态')
        : id === 'deleteRow'
          ? t('必须保留表头和至少一行正文')
          : ['mixed', 'all'].includes(context.target)
            ? t('请缩小选区后操作此类内容')
            : t('当前目标或结构不支持此操作'),
  }
}

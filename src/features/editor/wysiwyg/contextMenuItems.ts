import type { EditorState } from '@milkdown/kit/prose/state'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getEditorCommand } from './editorCommands'
import type { EditorContext } from './contextTarget'
import { canOpenEditorLink } from './editorLinks'

export const getContextMenuGroups = (
  context: EditorContext,
  state: EditorState,
): ContextMenuItem[][] => {
  const item = (id: string, label: string): ContextMenuItem => ({ id, label })
  const command = (id: string, label: string): ContextMenuItem => ({
    id,
    label,
    disabled: !getEditorCommand(state, id)?.(state),
  })
  const groups: ContextMenuItem[][] = []
  let touchesCode = false
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (node.type.name === 'code_block') touchesCode = true
  })
  if (!context.selection.empty) groups.push([item('copy', '复制'), item('cut', '剪切')])
  if (context.target === 'text' && !touchesCode)
    groups.push([
      command('bold', '加粗'),
      command('italic', '斜体'),
      command('strike', '删除线'),
      command('inlineCode', '行内代码'),
      item('setLink', '设置链接'),
      command('clearFormatting', '清除行内格式'),
    ])
  if (context.link)
    groups.push([
      {
        ...item('openLink', '打开链接'),
        disabled: !canOpenEditorLink(String(context.link.mark.attrs.href ?? '')),
      },
      item('copyLink', '复制链接地址'),
      item('editLink', '编辑链接'),
      item('removeLink', '移除链接'),
    ])
  if (context.target === 'image')
    groups.push([
      item('editImage', '替换图片 / 编辑说明'),
      item('copyImageAddress', '复制图片地址'),
      item('copyImageMarkdown', '复制图片 Markdown'),
      {
        id: 'imageAlign',
        label: '图片对齐',
        children: [
          item('imageLeft', '左对齐'),
          item('imageCenter', '居中'),
          item('imageRight', '右对齐'),
        ],
      },
      item('resetImageSize', '恢复尺寸'),
      item('deleteNode', '删除图片'),
    ])
  if (context.target === 'math')
    groups.push([
      item('editMath', '编辑公式源码'),
      item('copyMath', '复制公式源码'),
      item('deleteNode', '删除公式'),
    ])
  if (context.target === 'code')
    groups.push([
      item('copyCode', '复制整块代码'),
      item('editCodeLanguage', '设置代码语言'),
      item('paragraphBefore', '在代码前插入段落'),
      item('paragraphAfter', '在代码后插入段落'),
    ])
  if (context.containers.includes('table'))
    groups.push([
      {
        id: 'tableActions',
        label: '表格操作',
        children: [
          command('rowBefore', '上方插入行'),
          command('rowAfter', '下方插入行'),
          command('deleteRow', '删除行'),
          command('colBefore', '左侧插入列'),
          command('colAfter', '右侧插入列'),
          command('deleteColumn', '删除列'),
          command('alignColumnLeft', '列左对齐'),
          command('alignColumnCenter', '列居中'),
          command('alignColumnRight', '列右对齐'),
          command('deleteTable', '删除表格'),
        ],
      },
    ])
  if (context.containers.includes('list_item'))
    groups.push([
      command('toggleTask', '切换任务完成状态'),
      command('indentList', '增加缩进'),
      command('outdentList', '减少缩进 / 退出列表'),
    ])
  if (['text', 'block'].includes(context.target) && !touchesCode)
    groups.push([
      {
        id: 'convert',
        label: '转换当前块',
        children: [
          command('paragraph', '转为正文 / 退出容器'),
          ...Array.from({ length: 6 }, (_, index) =>
            command(`heading${index + 1}`, `${index + 1} 级标题`),
          ),
          command('bulletList', '无序列表'),
          command('orderedList', '有序列表'),
          command('blockquote', '引用'),
        ],
      },
      {
        id: 'insert',
        label: '在当前块后插入',
        children: [
          item('insertHr', '分割线'),
          item('insertCode', '代码块'),
          item('insertTable', '表格'),
          item('insertImage', '图片'),
        ],
      },
    ])
  groups.push([
    item('paste', context.target === 'code' ? '粘贴纯文本' : '粘贴'),
    command('undo', '撤销'),
    command('redo', '重做'),
    item('selectAll', context.target === 'code' ? '全选代码' : '全选'),
  ])
  return groups
}

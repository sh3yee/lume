import type { EditorState } from '@milkdown/kit/prose/state'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getActionState } from './actionState'
import { hasSelectedContent, type EditorContext } from './selectionContext'

export const getContextMenuGroups = (
  context: EditorContext,
  state: EditorState,
  editable = true,
): ContextMenuItem[][] => {
  const item = (id: string, label: string): ContextMenuItem => ({
    id,
    label,
    ...getActionState(state, context, id, editable),
  })
  const groups: ContextMenuItem[][] = []
  if (hasSelectedContent(context))
    groups.push([item('copy', '复制所选内容'), item('cut', '剪切所选内容')])
  if (context.target === 'text')
    groups.push([
      item('bold', '加粗'),
      item('italic', '斜体'),
      item('strike', '删除线'),
      item('inlineCode', '行内代码'),
      item('setLink', '设置所选文字链接'),
      item('clearFormatting', '清除所选文字格式'),
    ])
  if (context.target === 'inlineCode') groups.push([item('inlineCode', '取消行内代码')])
  if (context.link)
    groups.push([
      item('openLink', '打开链接'),
      item('copyLink', '复制链接地址'),
      item('editLink', '编辑当前链接地址'),
      item('removeLink', '移除当前链接'),
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
      item('resetImageSize', '恢复图片尺寸'),
      item('deleteNode', '删除当前图片'),
    ])
  if (context.target === 'math')
    groups.push([
      item('editMath', '编辑公式源码'),
      item('copyMath', '复制公式源码'),
      item('deleteNode', '删除当前公式'),
    ])
  if (context.target === 'code')
    groups.push([
      item('copyCode', '复制整块代码'),
      item('editCodeLanguage', '设置代码语言'),
      item('paragraphBefore', '在代码前插入段落'),
      item('paragraphAfter', '在代码后插入段落'),
    ])
  if (['source', 'footnote'].includes(context.target))
    groups.push([
      ...(context.node?.node.type.name === 'footnote_reference'
        ? [item('gotoFootnote', '跳转 / 编辑脚注定义')]
        : []),
      item('copySource', '复制节点 Markdown'),
      item('editSource', '在源码模式编辑'),
    ])
  if (context.target === 'rule')
    groups.push([
      item('paragraphBefore', '在分割线前插入段落'),
      item('paragraphAfter', '在分割线后插入段落'),
      item('deleteNode', '删除分割线'),
    ])
  if (context.target === 'block' && context.kind === 'node')
    groups.push([
      item('paragraphBefore', '在所选块前插入段落'),
      item('paragraphAfter', '在所选块后插入段落'),
      item('deleteNode', '删除整个所选块'),
    ])
  if (context.containers.includes('table'))
    groups.push([
      {
        id: 'tableActions',
        label: '当前表格 / 所选行列',
        children: [
          item('rowBefore', '上方插入行'),
          item('rowAfter', '下方插入行'),
          item('deleteRow', '删除所选行'),
          item('colBefore', '左侧插入列'),
          item('colAfter', '右侧插入列'),
          item('deleteColumn', '删除所选列'),
          item('alignColumnLeft', '整列左对齐'),
          item('alignColumnCenter', '整列居中'),
          item('alignColumnRight', '整列右对齐'),
          item('deleteTable', '删除整个表格'),
        ],
      },
    ])
  if (context.containers.includes('list_item') && ['block', 'text'].includes(context.target))
    groups.push([
      item('toggleTask', '切换当前任务项状态'),
      item('indentList', '增加所选项缩进'),
      item('outdentList', '减少所选项缩进 / 退出列表'),
    ])
  if (['text', 'block'].includes(context.target))
    groups.push([
      {
        id: 'convert',
        label: context.selection.empty ? '转换当前块' : '所选块 / 容器操作',
        children: [
          item('paragraph', '转为正文 / 退出所在容器'),
          ...Array.from({ length: 6 }, (_, index) =>
            item(`heading${index + 1}`, `转为 ${index + 1} 级标题`),
          ),
          item(
            'bulletList',
            context.containers.includes('list_item')
              ? '整个列表改为无序列表'
              : '所选块转为无序列表',
          ),
          item(
            'orderedList',
            context.containers.includes('list_item')
              ? '整个列表改为有序列表'
              : '所选块转为有序列表',
          ),
          item('blockquote', '所选块转为引用'),
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
    item('undo', '撤销'),
    item('redo', '重做'),
    item('selectAll', context.target === 'code' ? '全选代码' : '全选'),
  ])
  return editable
    ? groups
    : groups
        .map((group) =>
          group.flatMap((item) => {
            if (item.children) {
              const children = item.children.filter((child) => !child.disabled)
              return children.length ? [{ ...item, children }] : []
            }
            return item.disabled ? [] : [item]
          }),
        )
        .filter((group) => group.length)
}

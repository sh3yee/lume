import { t } from '@/app/i18n'
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
    groups.push([item('copy', t('复制所选内容')), item('cut', t('剪切所选内容'))])
  if (context.target === 'text')
    groups.push([
      item('bold', t('加粗')),
      item('italic', t('斜体')),
      item('strike', t('删除线')),
      item('inlineCode', t('行内代码')),
      item('setLink', t('设置所选文字链接')),
      item('clearFormatting', t('清除所选文字格式')),
    ])
  if (context.target === 'inlineCode') groups.push([item('inlineCode', t('取消行内代码'))])
  if (context.link)
    groups.push([
      item('openLink', t('打开链接')),
      item('copyLink', t('复制链接地址')),
      item('editLink', t('编辑当前链接地址')),
      item('removeLink', t('移除当前链接')),
    ])
  if (context.target === 'image')
    groups.push([
      item('editImage', t('替换图片 / 编辑说明')),
      item('copyImageAddress', t('复制图片地址')),
      item('copyImageMarkdown', t('复制图片 Markdown')),
      item('moveImageTo', t('移动 / 重命名图片…')),
      item('copyImageTo', t('复制图片到…')),
      item('uploadImage', t('上传图片')),
      {
        id: 'imageSize',
        label: t('缩放图片'),
        children: [25, 33, 50, 67, 80, 100, 125, 150, 200].map((zoom) =>
          item(`imageZoom${zoom}`, `${zoom}%`),
        ),
      },
      {
        id: 'imageAlign',
        label: t('图片对齐'),
        children: [
          item('imageLeft', t('左对齐')),
          item('imageCenter', t('居中')),
          item('imageRight', t('右对齐')),
        ],
      },
      item('resetImageSize', t('恢复图片尺寸')),
      item('deleteNode', t('移除图片引用')),
      item('deleteImageFile', t('删除图片及原文件…')),
    ])
  if (context.target === 'math')
    groups.push([
      ...(context.node?.node.type.name === 'math_block'
        ? []
        : [item('editMath', t('编辑公式源码'))]),
      item('copyMath', t('复制公式源码')),
      item('deleteNode', t('删除当前公式')),
    ])
  if (context.target === 'code')
    groups.push([
      item('copyCode', t('复制整块代码')),
      item('editCodeLanguage', t('设置代码语言')),
      item('paragraphBefore', t('在代码前插入段落')),
      item('paragraphAfter', t('在代码后插入段落')),
    ])
  if (['source', 'footnote'].includes(context.target))
    groups.push([
      ...(context.node?.node.type.name === 'footnote_reference'
        ? [item('gotoFootnote', t('跳转 / 编辑脚注定义'))]
        : []),
      item('copySource', t('复制节点 Markdown')),
      item(
        'editSource',
        context.node?.node.type.name.startsWith('html') ? t('编辑 HTML 源码') : t('在源码模式编辑'),
      ),
    ])
  if (context.target === 'rule')
    groups.push([
      item('paragraphBefore', t('在分割线前插入段落')),
      item('paragraphAfter', t('在分割线后插入段落')),
      item('deleteNode', t('删除分割线')),
    ])
  if (context.target === 'block' && context.kind === 'node')
    groups.push([
      item('paragraphBefore', t('在所选块前插入段落')),
      item('paragraphAfter', t('在所选块后插入段落')),
      item(
        'deleteNode',
        context.node?.node.type.name === 'table' ? t('删除整个表格') : t('删除整个所选块'),
      ),
    ])
  if (context.containers.includes('table'))
    groups.push([
      {
        id: 'tableActions',
        label: t('当前表格 / 所选行列'),
        children: [
          item('rowBefore', t('上方插入行')),
          item('rowAfter', t('下方插入行')),
          item('deleteRow', t('删除所选行')),
          item('colBefore', t('左侧插入列')),
          item('colAfter', t('右侧插入列')),
          item('deleteColumn', t('删除所选列')),
          item('alignColumnLeft', t('整列左对齐')),
          item('alignColumnCenter', t('整列居中')),
          item('alignColumnRight', t('整列右对齐')),
          item('deleteTable', t('删除整个表格')),
        ],
      },
    ])
  if (context.containers.includes('list_item') && ['block', 'text'].includes(context.target))
    groups.push([
      item('toggleTask', t('切换当前任务项状态')),
      item('indentList', t('增加所选项缩进')),
      item('outdentList', t('减少所选项缩进 / 退出列表')),
    ])
  if (['text', 'block'].includes(context.target))
    groups.push([
      {
        id: 'convert',
        label: context.selection.empty ? t('转换当前块') : t('所选块 / 容器操作'),
        children: [
          item('paragraph', t('转为正文 / 退出所在容器')),
          ...Array.from({ length: 6 }, (_, index) =>
            item(`heading${index + 1}`, t('转为 {0} 级标题', index + 1)),
          ),
          item(
            'bulletList',
            context.containers.includes('list_item')
              ? t('整个列表改为无序列表')
              : t('所选块转为无序列表'),
          ),
          item(
            'orderedList',
            context.containers.includes('list_item')
              ? t('整个列表改为有序列表')
              : t('所选块转为有序列表'),
          ),
          item('blockquote', t('所选块转为引用')),
        ],
      },
      {
        id: 'insert',
        label: t('在当前块后插入'),
        children: [
          item('insertHr', t('分割线')),
          item('insertCode', t('代码块')),
          item('insertTable', t('表格')),
          item('insertImageAfter', t('图片')),
          item('insertFrontMatter', t('YAML 元数据（文首）')),
          item('insertToc', t('目录')),
          {
            id: 'insertCallout',
            label: t('提示块'),
            children: [
              item('insertNote', t('Note · 说明')),
              item('insertTip', t('Tip · 技巧')),
              item('insertImportant', t('Important · 重要')),
              item('insertWarning', t('Warning · 警告')),
              item('insertCaution', t('Caution · 注意')),
            ],
          },
        ],
      },
    ])
  groups.push([
    item('paste', context.target === 'code' ? t('粘贴纯文本') : t('粘贴')),
    item('undo', t('撤销')),
    item('redo', t('重做')),
    item('selectAll', context.target === 'code' ? t('全选代码') : t('全选')),
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

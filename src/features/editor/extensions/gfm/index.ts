import { type Editor } from '@milkdown/kit/core'
import { gfm } from '@milkdown/preset-gfm'
import type MarkdownIt from 'markdown-it'

/** 注册表格、任务列表和删除线等 GFM 编辑能力。 */
export function useGfmWysiwygExtension(editor: Editor) {
  return editor.use(gfm)
}

/** 显式启用 markdown-it 内置的 GFM 兼容预览规则。 */
export function useGfmPreviewExtension(markdown: MarkdownIt) {
  return markdown.enable(['table', 'strikethrough'])
}

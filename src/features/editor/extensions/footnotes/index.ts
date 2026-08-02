import { type Editor } from '@milkdown/kit/core'
import markdownItFootnote from 'markdown-it-footnote'
import type MarkdownIt from 'markdown-it'

/** 脚注编辑能力由已注册的 GFM preset 提供，此入口明确其扩展边界。 */
export function useFootnotesWysiwygExtension(editor: Editor) {
  return editor
}

/** 注册脚注引用、定义列表和返回链接的 Preview 渲染。 */
export function useFootnotesPreviewExtension(markdown: MarkdownIt) {
  return markdown.use(markdownItFootnote)
}

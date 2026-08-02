import { type Editor } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import MarkdownIt from 'markdown-it'

/** 注册 CommonMark 基础语法。 */
export function useBaseWysiwygExtension(editor: Editor) {
  return editor.use(commonmark)
}

/** 创建 Preview 共用的基础 Markdown 渲染器。 */
export function createBasePreviewExtension() {
  return new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false })
}

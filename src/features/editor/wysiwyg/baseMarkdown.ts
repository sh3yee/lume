import { Editor } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/preset-gfm'

/** 注册 WYSIWYG 编辑器共用的基础 Markdown 与 GFM 能力。 */
export function useBaseMarkdown(editor: Editor) {
  return editor
    .use(commonmark)
    .use(gfm)
}
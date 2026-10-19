import { type Editor } from '@milkdown/kit/core'
import markdownItFootnote from 'markdown-it-footnote'
import type MarkdownIt from 'markdown-it'
import {
  footnoteDefinitionInputRule,
  footnoteInputPlugin,
  footnoteReferenceInputRule,
} from './input'
import { footnoteInteractionPlugin } from './interaction'
import { editableFootnoteReferenceSchema } from './schema'
import { footnoteReferenceView } from './referenceView'

/** 在 GFM 脚注解析基础上注册引用、定义的手动输入与关联转换。 */
export function useFootnotesWysiwygExtension(editor: Editor) {
  return editor
    .use(editableFootnoteReferenceSchema)
    .use(footnoteReferenceView)
    .use(footnoteDefinitionInputRule)
    .use(footnoteReferenceInputRule)
    .use(footnoteInputPlugin)
    .use(footnoteInteractionPlugin)
}

/** 注册脚注引用、定义列表和返回链接的 Preview 渲染。 */
export function useFootnotesPreviewExtension(markdown: MarkdownIt) {
  return markdown.use(markdownItFootnote)
}

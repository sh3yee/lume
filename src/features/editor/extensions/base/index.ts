import { type Editor } from '@milkdown/kit/core'
import { commonmark, remarkInlineLinkPlugin } from '@milkdown/kit/preset/commonmark'
import MarkdownIt from 'markdown-it'
import { linkDefinitionSchema, preservedReferences } from './linkDefinitions'
import { inlineLinkInputRule, linkDefinitionInputRule, referenceLinkInputRule } from './linkInput'
import { linkEditingPlugin, linkSourceSchema } from './linkEditing'
import { linkDefinitionPlugin, referenceLinkSchema } from './referenceLinks'

/** 注册 CommonMark 基础语法。 */
export function useBaseWysiwygExtension(editor: Editor) {
  return editor
    .use(commonmark.filter((plugin) => !remarkInlineLinkPlugin.includes(plugin)))
    .use(preservedReferences)
    .use(referenceLinkSchema)
    .use(linkDefinitionSchema)
    .use(linkDefinitionPlugin)
    .use(inlineLinkInputRule)
    .use(referenceLinkInputRule)
    .use(linkDefinitionInputRule)
    .use(linkSourceSchema)
    .use(linkEditingPlugin)
}

/** 创建 Preview 共用的基础 Markdown 渲染器。 */
export function createBasePreviewExtension() {
  return new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false })
}

import { type Editor } from '@milkdown/kit/core'
import {
  commonmark,
  createCodeBlockInputRule,
  emphasisStarInputRule,
  emphasisUnderscoreInputRule,
  strongInputRule,
  inlineCodeInputRule,
  insertHrInputRule,
  insertImageInputRule,
  wrapInHeadingInputRule,
  remarkInlineLinkPlugin,
  remarkHtmlTransformer,
} from '@milkdown/kit/preset/commonmark'
import MarkdownIt from 'markdown-it'
import { inlineSourceInputRule } from './inlineSourceInput'
import { inlineSourceSchema, inlineSourceEditingPlugin } from './inlineSourceEditing'
import { linkDefinitionSchema, preservedReferences } from './linkDefinitions'
import { inlineLinkInputRule, linkDefinitionInputRule, referenceLinkInputRule } from './linkInput'
import { linkEditingPlugin, linkSourceSchema } from './linkEditing'
import { linkDefinitionPlugin, referenceLinkSchema } from './referenceLinks'
import { autoLinksPlugin, autoLinksRemark } from './autoLinks'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { headingInputPlugin } from './headingInput'

/** 注册 CommonMark 基础语法。 */
export function useBaseWysiwygExtension(editor: Editor) {
  return editor
    .use(
      commonmark.filter(
        (plugin) =>
          plugin !== insertHrInputRule &&
          plugin !== createCodeBlockInputRule &&
          plugin !== insertImageInputRule &&
          plugin !== wrapInHeadingInputRule &&
          plugin !== emphasisStarInputRule &&
          plugin !== emphasisUnderscoreInputRule &&
          plugin !== strongInputRule &&
          plugin !== inlineCodeInputRule &&
          !remarkHtmlTransformer.includes(plugin) &&
          !remarkInlineLinkPlugin.includes(plugin),
      ),
    )
    .use(inlineSourceSchema)
    .use(inlineSourceInputRule)
    .use(inlineSourceEditingPlugin)
    .use(headingInputPlugin)
    .use(preservedReferences)
    .use(autoLinksRemark)
    .use(referenceLinkSchema)
    .use(linkDefinitionSchema)
    .use(linkDefinitionPlugin)
    .use(inlineLinkInputRule)
    .use(referenceLinkInputRule)
    .use(linkDefinitionInputRule)
    .use(linkSourceSchema)
    .use(linkEditingPlugin)
    .use(autoLinksPlugin)
}

/** 创建 Preview 共用的基础 Markdown 渲染器。 */
export function createBasePreviewExtension() {
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false })
  markdown.core.ruler.before('inline', 'lume-auto-links', (state) => {
    state.md.options.linkify = markdownPreferences.enabled.autoLink
  })
  return markdown
}

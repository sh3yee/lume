import type { Editor } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { htmlInteraction } from './interaction'
import { htmlInputPlugin } from './input'
import { createHtmlNodeView } from './nodeView'
import { htmlRemark } from './remark'
import { htmlBlockSchema, htmlInlineSchema, htmlSourceSchema, preservedHtmlSchema } from './schema'
import './styles.css'

export const useHtmlWysiwygExtension = (
  editor: Editor,
  resolveSource: (source: string) => string | Promise<string>,
  onOpenLink?: (view: EditorView, href: string) => void,
) =>
  editor
    .use(htmlRemark)
    .use(htmlInlineSchema)
    .use(htmlBlockSchema)
    .use(htmlSourceSchema)
    .use(preservedHtmlSchema)
    .use(htmlInputPlugin)
    .use(htmlInteraction)
    .use(
      $view(
        htmlBlockSchema.node,
        () => (node, view, getPos) =>
          createHtmlNodeView(node, view, getPos, resolveSource, onOpenLink),
      ),
    )
    .use(
      $view(
        preservedHtmlSchema.node,
        () => (node, view, getPos) =>
          createHtmlNodeView(node, view, getPos, resolveSource, onOpenLink),
      ),
    )

export { useHtmlPreviewExtension, collectHtmlResourceSources } from './preview'

import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import type { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { replaceAll } from '@milkdown/kit/utils'
import { useWysiwygMarkdownExtensions } from '../extensions'

export async function createWysiwygEditor(options: {
  initialMarkdown: string
  root: HTMLElement
  importImageFile: (file: File) => Promise<string | null>
  isDocumentActive: () => boolean
  onImageSelect: (view: EditorView, selection: NodeSelection) => void
  onMarkdownChange: (markdown: string, view: EditorView | null) => void
  onSelectionChange: (view: EditorView | null, line: number, column: number) => void
  resolveImageSource: (src: string) => string | Promise<string>
}) {
  return useWysiwygMarkdownExtensions(Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root)
      ctx.set(defaultValueCtx, options.initialMarkdown)

      ctx.get(listenerCtx)
        .markdownUpdated((listenerContext, markdown) => {
          let view: EditorView | null = null
          try {
            view = listenerContext.get(editorViewCtx)
          } catch {
            // editorViewCtx may not be available during initial listener hydration.
          }
          options.onMarkdownChange(markdown, view)
        })
        .selectionUpdated((listenerContext, selection) => {
          const before = selection.$from.doc.textBetween(0, selection.from, '\n', '\n')
          const lines = before.split('\n')
          let view: EditorView | null = null
          try {
            view = listenerContext.get(editorViewCtx)
          } catch {
            view = null
          }
          options.onSelectionChange(view, lines.length, (lines.at(-1)?.length || 0) + 1)
        })
    }), options)
    .use(history)
    .use(listener)
    .create()
}

export function replaceEditorMarkdown(editor: Editor, markdown: string) {
  editor.action(replaceAll(markdown))
}

export async function destroyWysiwygEditor(editor: Editor | null) {
  await editor?.destroy()
}
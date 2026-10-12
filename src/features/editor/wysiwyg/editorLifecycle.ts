import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
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
  return useWysiwygMarkdownExtensions(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, options.root)
      ctx.set(defaultValueCtx, options.initialMarkdown)

      ctx
        .get(listenerCtx)
        .markdownUpdated((listenerContext, markdown, previousMarkdown) => {
          // 节点属性调整但 Markdown 未变化时，不把原始文件格式化为一次编辑。
          if (markdown === previousMarkdown) return
          let view: EditorView | null = null
          try {
            view = listenerContext.get(editorViewCtx)
          } catch {
            // editorViewCtx may not be available during initial listener hydration.
          }
          // 外部同步后仍可能收到旧事务的防抖回调，不能用旧内容覆盖新文档。
          if (view && listenerContext.get(serializerCtx)(view.state.doc) !== markdown) return
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
    }),
    options,
  )
    .use(history)
    .use(listener)
    .create()
}

export function replaceEditorMarkdown(editor: Editor, markdown: string) {
  // 外部内容同步重建基准，不触发编辑回调或写入用户撤销历史。
  editor.action(replaceAll(markdown, true))
}

export async function destroyWysiwygEditor(editor: Editor | null) {
  await editor?.destroy()
}

import { editorViewCtx, type CmdKey, type Editor } from '@milkdown/kit/core'
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand } from '@milkdown/preset-gfm'
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { AllSelection, NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { callCommand } from '@milkdown/kit/utils'
import type { ImageAlign } from '@/utils/imageHtml'

export function getConvertibleBlockPosition(state: EditorState) {
  const { from, to } = state.selection
  const start = state.doc.resolve(from)
  const end = state.doc.resolve(Math.max(from, to - 1))

  for (let depth = start.depth; depth > 0; depth -= 1) {
    const node = start.node(depth)
    if (!['heading', 'code_block'].includes(node.type.name)) continue

    const position = start.before(depth)
    for (let endDepth = end.depth; endDepth > 0; endDepth -= 1) {
      if (end.before(endDepth) === position && end.node(endDepth) === node) return position
    }
  }

  return null
}

export function createEditorCommands(options: {
  getEditor: () => Editor | null
  onBeforeCommand: () => void
  onCopy: () => void
  onImageAlign: (view: EditorView, align: ImageAlign) => void
}) {
  let clipboardText = ''

  const runWithView = (action: (view: EditorView) => void) => {
    options.onBeforeCommand()
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.focus()
      action(view)
    })
  }

  const runMilkdownCommand = <T>(command: CmdKey<T>, payload?: T) => {
    options.onBeforeCommand()
    options.getEditor()?.action((ctx) => {
      ctx.get(editorViewCtx).focus()
      return callCommand(command, payload)(ctx)
    })
  }

  const runNativeEditCommand = (command: 'copy' | 'cut') => {
    runWithView((view) => {
      const { from, to, empty } = view.state.selection
      if (empty) return

      clipboardText = view.state.doc.textBetween(from, to, '\n', '\n')
      // 原生剪切事件会由 ProseMirror 写入剪贴板并删除选区，无需再次手动删除。
      document.execCommand(command)

      if (command === 'copy') options.onCopy()
    })
  }

  return {
    clearInlineFormatting() {
      runWithView((view) => {
        const { state } = view
        const { from, to } = state.selection
        const tr = Object.values(state.schema.marks).reduce(
          (transaction, markType) => transaction.removeMark(from, to, markType),
          state.tr,
        )
        view.dispatch(tr.scrollIntoView())
      })
    },
    convertCurrentBlockToParagraph() {
      runWithView((view) => {
        const position = getConvertibleBlockPosition(view.state)
        const paragraph = view.state.schema.nodes.paragraph
        if (position === null || !paragraph) return
        view.dispatch(view.state.tr.setNodeMarkup(position, paragraph).scrollIntoView())
      })
    },
    copy: () => runNativeEditCommand('copy'),
    cut: () => runNativeEditCommand('cut'),
    insertBlockquote() {
      runWithView((view) => {
        const blockquote = view.state.schema.nodes.blockquote
        const paragraph = view.state.schema.nodes.paragraph
        if (!blockquote || !paragraph) return
        const { from, to } = view.state.selection
        const text = view.state.doc.textBetween(from, to, '\n', '\n') || '引用'
        const node = blockquote.create(null, paragraph.create(null, view.state.schema.text(text)))
        const tr = view.state.tr.replaceRangeWith(from, to, node)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 2, from + 2 + text.length)).scrollIntoView())
      })
    },
    insertCodeBlock: () => runMilkdownCommand(createCodeBlockCommand.key),
    insertHeading(level: number) {
      runWithView((view) => {
        const heading = view.state.schema.nodes.heading
        if (!heading) return
        const { from, to } = view.state.selection
        const text = view.state.doc.textBetween(from, to, '\n', '\n') || '标题'
        const node = heading.create({ level }, view.state.schema.text(text))
        const tr = view.state.tr.replaceRangeWith(from, to, node)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + text.length)).scrollIntoView())
      })
    },
    insertHorizontalRule: () => runMilkdownCommand(insertHrCommand.key),
    insertImageTemplate() {
      const template = '![图片描述](图片地址)'
      runWithView((view) => {
        const { from, to } = view.state.selection
        const tr = view.state.tr.insertText(template, from, to)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 7)).scrollIntoView())
      })
    },
    insertList(ordered: boolean) {
      runWithView((view) => {
        const list = ordered ? view.state.schema.nodes.ordered_list : view.state.schema.nodes.bullet_list
        const listItem = view.state.schema.nodes.list_item
        const paragraph = view.state.schema.nodes.paragraph
        if (!list || !listItem || !paragraph) return
        const { from, to } = view.state.selection
        const text = view.state.doc.textBetween(from, to, '\n', '\n') || '列表项'
        const node = list.create(null, listItem.create(null, paragraph.create(null, view.state.schema.text(text))))
        const tr = view.state.tr.replaceRangeWith(from, to, node)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 3, from + 3 + text.length)).scrollIntoView())
      })
    },
    insertTable: () => runMilkdownCommand(insertTableCommand.key, { row: 3, col: 3 }),
    paste() {
      runWithView((view) => {
        if (clipboardText) {
          view.dispatch(view.state.tr.insertText(clipboardText).scrollIntoView())
          return
        }
        document.execCommand('paste')
      })
    },
    redo: () => runMilkdownCommand(redoCommand.key),
    selectAll() {
      runWithView((view) => {
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      })
    },
    setImageAlign(align: ImageAlign) {
      runWithView((view) => {
        const selection = view.state.selection
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
        const tr = view.state.tr.setNodeMarkup(selection.from, undefined, {
          ...selection.node.attrs,
          align,
        })
        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, selection.from)).scrollIntoView())
        options.onImageAlign(view, align)
      })
    },
    toggleBold: () => runMilkdownCommand(toggleStrongCommand.key),
    toggleInlineCode: () => runMilkdownCommand(toggleInlineCodeCommand.key),
    toggleItalic: () => runMilkdownCommand(toggleEmphasisCommand.key),
    undo: () => runMilkdownCommand(undoCommand.key),
  }
}
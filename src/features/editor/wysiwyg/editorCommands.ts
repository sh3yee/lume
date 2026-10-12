import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import { toggleMark } from '@milkdown/kit/prose/commands'
import { undo, redo } from '@milkdown/kit/prose/history'
import {
  AllSelection,
  NodeSelection,
  type Command,
  type EditorState,
} from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { ImageAlign } from '@/utils/imageHtml'
import {
  convertBlockquote,
  convertHeading,
  convertList,
  convertParagraph,
  indentList,
  insertBlock,
  outdentList,
  toggleTask,
} from './blockCommands'
import { pasteClipboard } from './clipboard'
import { tableCommands } from './tableCommands'

export const getEditorCommand = (state: EditorState, name: string): Command | undefined => {
  const marks = state.schema.marks
  const commands: Record<string, Command> = {
    paragraph: convertParagraph,
    blockquote: convertBlockquote,
    bulletList: convertList(false),
    orderedList: convertList(true),
    indentList,
    outdentList,
    toggleTask,
    bold: toggleMark(marks.strong),
    italic: toggleMark(marks.emphasis),
    strike: toggleMark(marks.strike_through),
    inlineCode: toggleMark(marks.inlineCode),
    clearFormatting: (current, dispatch) => {
      if (current.selection.empty) return false
      const { from, to } = current.selection
      dispatch?.(current.tr.removeMark(from, to).scrollIntoView())
      return true
    },
    undo,
    redo,
    ...tableCommands,
  }
  const heading = name.match(/^heading([1-6])$/)
  return heading ? convertHeading(Number(heading[1])) : commands[name]
}

export function createEditorCommands(options: {
  getEditor: () => Editor | null
  onBeforeCommand: () => boolean | void
  onCopy: () => void
  onError: (message: string) => void
  isActive: () => boolean
  onImageAlign: (view: EditorView, align: ImageAlign) => void
}) {
  const runWithView = (action: (view: EditorView) => void) => {
    if (options.onBeforeCommand() === false) return
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.focus()
      action(view)
    })
  }

  const execute = (name: string) =>
    runWithView((view) => {
      getEditorCommand(view.state, name)?.(view.state, view.dispatch, view)
    })

  const runNativeEditCommand = (command: 'copy' | 'cut') =>
    runWithView((view) => {
      if (view.state.selection.empty) return
      document.execCommand(command)
      if (command === 'copy') options.onCopy()
    })

  const insertNode = (type: string) =>
    runWithView((view) => {
      const node = view.state.schema.nodes[type]?.createAndFill()
      if (node) view.dispatch(insertBlock(view.state, node))
    })

  return {
    execute,
    clearInlineFormatting: () => execute('clearFormatting'),
    convertCurrentBlockToParagraph: () => execute('paragraph'),
    copy: () => runNativeEditCommand('copy'),
    cut: () => runNativeEditCommand('cut'),
    insertBlockquote: () => execute('blockquote'),
    insertHeading: (level: number) => execute(`heading${level}`),
    insertList: (ordered: boolean) => execute(ordered ? 'orderedList' : 'bulletList'),
    insertCodeBlock: () => insertNode('code_block'),
    insertHorizontalRule: () => insertNode('hr'),
    insertTable: () =>
      runWithView((view) => {
        const { schema } = view.state
        const makeCells = (type: string) =>
          Array.from({ length: 3 }, () => schema.nodes[type].createAndFill()!)
        const rows = [
          schema.nodes.table_header_row.create(null, makeCells('table_header')),
          ...Array.from({ length: 2 }, () =>
            schema.nodes.table_row.create(null, makeCells('table_cell')),
          ),
        ]
        view.dispatch(insertBlock(view.state, schema.nodes.table.create(null, rows)))
      }),
    paste: () =>
      runWithView((view) => void pasteClipboard(view, options.isActive, options.onError)),
    redo: () => execute('redo'),
    undo: () => execute('undo'),
    selectAll: () =>
      runWithView((view) => {
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      }),
    setImageAlign: (align: ImageAlign) =>
      runWithView((view) => {
        const selection = view.state.selection
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
        view.dispatch(
          view.state.tr.setNodeAttribute(selection.from, 'align', align).scrollIntoView(),
        )
        options.onImageAlign(view, align)
      }),
    toggleBold: () => execute('bold'),
    toggleInlineCode: () => execute('inlineCode'),
    toggleItalic: () => execute('italic'),
  }
}
